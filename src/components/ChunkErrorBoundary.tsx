import React from 'react';

interface State { error: Error | null }

/** Bắt lỗi hiển thị (ví dụ không tải được một thành phần sau khi có bản mới) và cho phép tải lại thay vì để trắng màn hình. */
export class ChunkErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-[#0a1417] text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <div className="text-base font-semibold">Không tải được giao diện</div>
          <p className="text-sm text-slate-400">Có thể đã có bản cập nhật mới trong lúc bạn đang mở trang. Hãy tải lại trang để dùng bản mới nhất.</p>
          <button type="button" onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold">Tải lại trang</button>
        </div>
      </div>
    );
  }
}
