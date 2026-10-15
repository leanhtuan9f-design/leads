// Quy đổi khung giờ làm việc địa phương sang giờ Việt Nam (tính theo ngày hiện tại nên đúng cả khi nước đó đổi giờ mùa hè).
const VN = 'Asia/Ho_Chi_Minh';

const parts = (tz: string, t: number) => {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t));
  return { h: Number(f.find(p => p.type === 'hour')?.value), m: Number(f.find(p => p.type === 'minute')?.value) };
};
const fmtVn = (t: number) => new Intl.DateTimeFormat('vi-VN', { timeZone: VN, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));

/** Giờ Việt Nam tương ứng với "h giờ" địa phương (gần nhất trong 24 giờ tới). */
function vnAt(tz: string, hour: number): string | null {
  const target = hour % 24;
  const t0 = Math.ceil(Date.now() / 900000) * 900000; // căn theo mốc 15 phút để trúng đúng phút :00 địa phương (kể cả múi giờ lệch :30/:45)
  for (let i = 0; i <= 24 * 4; i++) {
    const t = t0 + i * 15 * 60000;
    const p = parts(tz, t);
    if (p.h === target && p.m === 0) return fmtVn(t);
  }
  return null;
}

export function windowPreview(tz: string, start: number, end: number): string {
  if (!tz) return '';
  try {
    const a = vnAt(tz, start), b = vnAt(tz, end);
    const now = parts(tz, Date.now());
    if (!a || !b) return '';
    return `${start}h–${end}h giờ địa phương (${tz}) = khoảng ${a} – ${b} giờ Việt Nam (tính theo hôm nay). Bây giờ ở đó là ${String(now.h).padStart(2, '0')}:${String(now.m).padStart(2, '0')}.`;
  } catch {
    return '';
  }
}
