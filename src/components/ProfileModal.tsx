import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiJson } from '../auth/types';

export interface UserProfile {
  offer: string;
  customers: string;
  area: string;
  notes: string;
}

const EMPTY: UserProfile = { offer: '', customers: '', area: '', notes: '' };

interface ProfileModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ onClose, onSaved }) => {
  const [form, setForm] = useState<UserProfile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiJson<{ value: Partial<UserProfile> | null }>('/state/profile')
      .then(r => setForm({ ...EMPTY, ...(r.value || {}) }))
      .catch(e => setError(e instanceof Error ? e.message : 'Không tải được hồ sơ'))
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiJson('/state/profile', 'PUT', { value: form });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được');
      setSaving(false);
    }
  };

  const field = (key: keyof UserProfile, label: string, hint: string, rows: number, max: number) => (
    <div>
      <label className="block text-xs font-semibold text-slate-200 mb-1">{label}</label>
      <textarea
        value={form[key]}
        required={key === 'offer'}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        rows={rows}
        maxLength={max}
        placeholder={hint}
        className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form onSubmit={save} className="bg-slate-950 border border-slate-800 rounded-lg max-w-lg w-full p-5 shadow-2xl space-y-3.5">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white">Hồ sơ của bạn</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Chỉ cần nhập sản phẩm/dịch vụ, AI sẽ tự suy ra ai là khách hàng và gợi ý ngành + khu vực nên tìm. Các ô khác giúp gợi ý chính xác hơn. Không nhập thông tin bí mật hay mật khẩu.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded" aria-label="Đóng">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? <div className="text-xs text-slate-400">Đang tải…</div> : (
          <>
            {field('offer', 'Bạn bán sản phẩm / dịch vụ gì? * (chỉ cần ô này)', 'Ví dụ: Thiết kế website và chạy quảng cáo Google cho doanh nghiệp nhỏ', 3, 600)}
            {field('customers', 'Khách hàng lý tưởng (không bắt buộc — để trống AI tự suy luận)', 'Ví dụ: Phòng khám, spa, nhà hàng chưa có website hoặc ít đánh giá trên Google Maps', 3, 600)}
            {field('area', 'Khu vực hoạt động', 'Ví dụ: Hà Nội và các quận nội thành', 2, 300)}
            {field('notes', 'Ghi chú thêm', 'Ví dụ: ưu tiên doanh nghiệp có SĐT, tránh chuỗi lớn', 2, 600)}
          </>
        )}

        {error && <div className="text-xs text-red-300">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-900 border border-slate-700 rounded-md">Hủy</button>
          <button type="submit" disabled={loading || saving} className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 rounded-md">
            {saving ? 'Đang lưu…' : 'Lưu hồ sơ'}
          </button>
        </div>
      </form>
    </div>
  );
};
