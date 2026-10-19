// Call inside the scheduler's transaction. Existing results and stopped tasks stay intact.
export function settleAutoTasks(db, now = Date.now()) {
  return db.prepare(`UPDATE auto_tasks SET status='done', finished_at=?
    WHERE status='running' AND NOT EXISTS (
      SELECT 1 FROM auto_runs r WHERE r.task_id=auto_tasks.id
      AND (r.status IN ('pending','running') OR r.split_state='todo'))`).run(now).changes;
}

export function expandAutoPlan(db, { citiesOfCountry, makeKey, maxRuns, maxLevel, retryFailed = false }) {
  let pairs = 0, splits = 0, tasks = 0;
  for (const t of db.prepare("SELECT * FROM auto_tasks WHERE plan_round>0 AND status IN ('done','running')").all()) {
    const cities = citiesOfCountry(t.country)?.cities || [];
    const keywords = JSON.parse(t.keywords);
    let count = db.prepare('SELECT COUNT(*) AS n FROM auto_runs WHERE task_id=?').get(t.id).n;
    const have = new Set(db.prepare('SELECT qkey FROM auto_runs WHERE task_id=?').all(t.id).map(r => r.qkey));
    let added = 0;
    const ins = db.prepare("INSERT INTO auto_runs (task_id,keyword,city,qtext,qkey,status) VALUES (?,?,?,?,?,'pending')");
    const usedCities = new Set(JSON.parse(t.cities));
    for (const city of cities) for (const kw of keywords) {
      const place = city.toLowerCase().endsWith(t.country.toLowerCase()) ? city : `${city}, ${t.country}`;
      const qtext = `${kw} ${place}`, qkey = makeKey(qtext, 'vi', '');
      if (have.has(qkey) || count >= maxRuns) continue;
      ins.run(t.id, kw, city, qtext, qkey);
      have.add(qkey); usedCities.add(city); count++; added++;
    }
    const deeper = count < maxRuns ? db.prepare(`UPDATE auto_runs SET split_state='todo'
      WHERE task_id=? AND saturated=1 AND level<? AND
      (split_state='maxlevel' OR (? AND split_state='failed'))`).run(t.id, maxLevel, retryFailed ? 1 : 0).changes : 0;
    if (added || deeper) {
      db.prepare("UPDATE auto_tasks SET status='running', finished_at=NULL, cities=?, note=? WHERE id=?")
        .run(JSON.stringify([...usedCities]), `Mở rộng: +${added} cặp thành phố, ${deeper} khu vực chờ tách sâu`, t.id);
      pairs += added; splits += deeper; tasks++;
    }
  }
  return { pairs, splits, tasks };
}
