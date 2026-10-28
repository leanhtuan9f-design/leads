#!/usr/bin/env python3
"""Reconcile source databases read-only into the independent company warehouse.

No imports from Maps backend; no migrations, writes or scheduler startup in sources.
Historical facts survive disappearance from sources. Exact-name source buckets are
provisional profiles, never asserted legal identities. Cross-source merges are manual.
"""
import argparse
import fcntl
import hashlib
import json
import os
import re
import sqlite3
import time
import unicodedata
from pathlib import Path
from urllib.parse import quote, urlsplit

ISO = set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split())
SHARED = set('facebook.com instagram.com linkedin.com twitter.com x.com youtube.com youtu.be tiktok.com wa.me whatsapp.com google.com goo.gl business.site wixsite.com wordpress.com blogspot.com linktr.ee 52wmb.com datatradepro.com alibaba.com yellowpages.com yelp.com email.com example.com'.split())

def norm(value):
    s = unicodedata.normalize('NFKD', str(value or '')).lower()
    return ' '.join(''.join(ch if ch.isalnum() else ' ' for ch in s if not unicodedata.category(ch).startswith('M')).split())

def country(value):
    s = str(value or '').strip().upper()
    s = {'UK': 'GB'}.get(s, s)
    return s if s in ISO else ''

def digest(s):
    return hashlib.sha256(s.encode()).hexdigest()

def packed(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

def connect_source(path):
    db = sqlite3.connect('file:' + quote(str(Path(path).resolve())) + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    db.execute('BEGIN')
    return db

def contact_values(payload, free):
    out = set()
    email = ';'.join(str(x or '') for x in [payload.get('email'), *(payload.get('additionalEmails') or [])])
    for v in re.findall(r'[A-Za-z0-9.!#$%&\x27*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+', email):
        e = v.lower(); out.add(('email', v, e)); d = e.split('@')[-1]
        if d not in free and d not in SHARED and not re.match(r'^(gmail|googlemail|yahoo|ymail|rocketmail|hotmail|outlook|live|msn|yandex|gmx)\.', d):
            out.add(('domain', d, d))
    phone = str(payload.get('phone') or payload.get('supplier_phone') or '').strip()
    if phone:
        out.add(('phone', phone, re.sub(r'\D', '', phone)))
    website = str(payload.get('website') or '').strip()
    if website:
        try:
            u = urlsplit(website if '://' in website else 'https://' + website)
            h = (u.hostname or '').lower().removeprefix('www.').rstrip('.')
            if u.scheme in ('https', 'http') and re.fullmatch(r'[a-z0-9-]+(?:\.[a-z0-9-]+)+', h):
                out.add(('website', website, h))
                if not any(h == d or h.endswith('.' + d) for d in SHARED):
                    out.add(('domain', h, h))
        except ValueError:
            pass
    return out

def sync(maps_path, customs_path, output):
    os.umask(0o077)
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    with open(str(output) + '.sync.lock', 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'skipped': 'another sync is running'}
        db = sqlite3.connect(output, timeout=30)
        db.row_factory = sqlite3.Row
        db.executescript(Path(__file__).with_name('company-warehouse.sql').read_text())
        db.execute('PRAGMA cache_size=-8000')
        now = int(time.time() * 1000)
        # A killed worker has released flock; its durable state must not stay running.
        db.execute("UPDATE company_sync_runs SET status='interrupted',finished_at=? WHERE status='running'", (now,))
        run = db.execute("INSERT INTO company_sync_runs(started_at,status) VALUES(?,'running')", (now,)).lastrowid
        db.commit()
        counts = {}; processed = 0; sources = []
        definitions = Path(__file__).with_name('customs-data.mjs').read_text()
        free = set(re.findall(r"'([^']+)'", definitions.split('const FREE_EXACT = new Set([')[1].split(']);')[0]))

        def ingest(source, key, role, name, cc, city, confidence, payload, contacts, bucket=None):
            nonlocal processed
            if not norm(name):
                counts['skipped_empty_name'] = counts.get('skipped_empty_name', 0) + 1
                return
            # Source name buckets preserve the raw country token to avoid coalescing
            # unrelated unknown/obsolete country codes. They never cross providers.
            source_key = key if bucket is None else bucket
            company_id = 'co_' + digest(packed([source, source_key]))[:32]
            fact_id = digest(packed([source, key, role]))
            encoded = packed(payload); hash_value = digest(encoded)
            old = db.execute('SELECT content_hash,company_id FROM company_facts WHERE id=?', (fact_id,)).fetchone()
            db.execute('''INSERT INTO companies(id,source,source_key,name,name_norm,country,city,role,confidence,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                name=CASE WHEN name_norm<>excluded.name_norm THEN excluded.name ELSE name END,name_norm=excluded.name_norm,country=excluded.country,city=excluded.city,
                confidence=excluded.confidence,updated_at=excluded.updated_at
                WHERE name_norm<>excluded.name_norm OR country<>excluded.country OR city<>excluded.city OR confidence<>excluded.confidence''',
                (company_id, source, str(source_key), str(name), norm(name), country(cc), str(city or ''), role, confidence, now, now))
            if not old or old['content_hash'] != hash_value or old['company_id'] != company_id:
                db.execute('''INSERT INTO company_facts(id,company_id,source,source_key,role,payload,content_hash,product,hs,trade_date,first_imported_at,imported_at,last_run)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,
                    payload=excluded.payload,content_hash=excluded.content_hash,product=excluded.product,hs=excluded.hs,
                    trade_date=excluded.trade_date,imported_at=excluded.imported_at,last_run=excluded.last_run''',
                    (fact_id, company_id, source, str(key), role, encoded, hash_value, payload.get('product_group') or '',
                     str(payload.get('hs') or ''), str(payload.get('date') or ''), now, now, run))
                db.execute('DELETE FROM company_contacts WHERE fact_id=?', (fact_id,))
                for kind, value, normalized in contact_values(contacts, free):
                    db.execute('INSERT OR IGNORE INTO company_contacts VALUES(?,?,?,?,?)', (fact_id, company_id, kind, value, normalized))
                db.execute('UPDATE companies SET updated_at=? WHERE id=?', (now, company_id))
                if old:
                    db.execute('UPDATE companies SET updated_at=? WHERE id=?', (now, old['company_id']))
                counts['changed_facts'] = counts.get('changed_facts', 0) + 1
            else:
                db.execute('UPDATE company_facts SET last_run=? WHERE id=?', (run, fact_id))
            counts[source] = counts.get(source, 0) + 1
            processed += 1
            if processed % 1000 == 0:
                db.commit()

        try:
            m = connect_source(maps_path); sources.append(m)
            for row in m.execute('SELECT place_id,data,first_seen,last_seen,closed_suspect FROM places'):
                try:
                    p = json.loads(row['data'])
                    if not isinstance(p, dict): raise ValueError()
                except (ValueError, TypeError):
                    counts['invalid_maps_json'] = counts.get('invalid_maps_json', 0) + 1
                    continue
                payload = {**p, 'source_first_seen': row['first_seen'], 'source_last_seen': row['last_seen'], 'closed_suspect': row['closed_suspect']}
                ingest('maps', row['place_id'], 'location', p.get('title'), p.get('country'), p.get('city'), 'normal', payload, p)
            db.commit(); m.close(); sources.remove(m)
            c = connect_source(customs_path); sources.append(c)
            for row in c.execute('SELECT * FROM directory_entities'):
                p = dict(row)
                ingest('directory', p['dedupe_key'], p['entity_type'], p['name'], p['country'], p['city'], p['confidence'], p, p)
            db.commit()
            for row in c.execute('SELECT * FROM customs_shipments'):
                p = dict(row)
                for role in ['buyer', 'supplier']:
                    name = p[role]; cc = p['buyer_country'] if role == 'buyer' else ''
                    # No claim that the supplier is Vietnamese when schema has no country.
                    bucket = packed([role, norm(name), str(cc or '').upper()])
                    contacts = {'phone': p.get('supplier_phone')} if role == 'supplier' else {}
                    ingest('shipments', p['dedupe_key'], role, name, cc, '', 'normal', p, contacts, bucket)
            db.commit()
            for row in c.execute('SELECT * FROM customs_rankings'):
                p = dict(row); bucket = packed([p['role'], norm(p['name']), str(p['country'] or '').upper()])
                ingest('rankings', p['dedupe_key'], p['role'], p['name'], p['country'], '', 'normal', p, {}, bucket)
            db.commit(); c.close(); sources.remove(c)
            # Exact-name cross-provider candidates only. A domain corroborates a
            # name; it does not collapse all branches of a chain into one company.
            db.execute('''INSERT INTO company_candidates(left_id,right_id,signals,revision)
                SELECT a.id,b.id,
                  CASE WHEN EXISTS(SELECT 1 FROM company_contacts x JOIN company_contacts y
                    ON x.kind='domain' AND y.kind=x.kind AND y.normalized=x.normalized
                    WHERE x.company_id=a.id AND y.company_id=b.id) THEN 'name_country,domain' ELSE 'name_country' END,
                  CAST(a.updated_at AS TEXT)||':'||CAST(b.updated_at AS TEXT)
                FROM companies a JOIN companies b ON a.country=b.country AND a.name_norm=b.name_norm
                WHERE a.id<b.id AND a.country<>'' AND length(a.name_norm)>=5 AND a.source<>b.source
                ON CONFLICT(left_id,right_id) DO UPDATE SET signals=excluded.signals,
                  evidence_changed=CASE WHEN company_candidates.status='pending' THEN 0
                    WHEN company_candidates.revision<>excluded.revision THEN 1 ELSE company_candidates.evidence_changed END,
                  revision=CASE WHEN company_candidates.status='pending' THEN excluded.revision ELSE company_candidates.revision END''')
            db.execute("UPDATE company_sync_runs SET status='completed',finished_at=?,counts=? WHERE id=?", (int(time.time()*1000), packed(counts), run))
            db.commit()
            return {'run': run, 'counts': counts, 'profiles': db.execute('SELECT COUNT(*) FROM companies').fetchone()[0]}
        except Exception as e:
            db.rollback()
            db.execute("UPDATE company_sync_runs SET status='failed',finished_at=?,counts=?,error=? WHERE id=?", (int(time.time()*1000), packed(counts), str(e)[:500], run))
            db.commit()
            raise
        finally:
            for s in sources: s.close()
            db.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--maps', default=os.environ.get('DB_PATH', '/var/lib/maps-data/cache.db'))
    parser.add_argument('--customs', default=os.environ.get('CUSTOMS_DB_PATH', '/var/lib/maps-data/customs.db'))
    parser.add_argument('--output', default=os.environ.get('COMPANY_DB_PATH', '/var/lib/maps-data/companies.db'))
    args = parser.parse_args()
    print(packed(sync(args.maps, args.customs, args.output)))
