import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const PASSCODE = '1234';

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => {
    return localStorage.getItem('hotel_inv_auth') === 'true';
  });
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState(false);

  const [locations, setLocations] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [loading, setLoading] = useState(true);

  // 編集中の数量を保持
  const [editedQuantities, setEditedQuantities] = useState({});

  // 確認モーダル（ダイアログ）用ステート
  const [confirmModalItem, setConfirmModalItem] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // データ取得
  const fetchData = async () => {
    try {
      const { data: locs, error: locErr } = await supabase.from('locations').select('*').order('id');
      if (locErr) throw locErr;
      setLocations(locs || []);

      const { data: itms, error: itmErr } = await supabase.from('items').select('*, locations(name)').order('id');
      if (itmErr) throw itmErr;
      
      setItems(itms || []);

      // 初期数量の設定
      const initialQty = {};
      (itms || []).forEach(item => {
        initialQty[item.id] = item.quantity;
      });
      setEditedQuantities(initialQty);
    } catch (err) {
      console.error('Data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated) {
      fetchData();
      const timer = setInterval(() => {
        fetchData();
      }, 10000); // 10秒自動ポーリング
      return () => clearInterval(timer);
    }
  }, [authenticated]);

  // パスコード認証処理
  const handleLogin = (e) => {
    e.preventDefault();
    if (passInput === PASSCODE) {
      localStorage.setItem('hotel_inv_auth', 'true');
      setAuthenticated(true);
      setPassError(false);
    } else {
      setPassError(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hotel_inv_auth');
    setAuthenticated(false);
  };

  // 数量変更 (+/- ボタン)
  const handleQuantityChange = (itemId, delta) => {
    setEditedQuantities(prev => ({
      ...prev,
      [itemId]: Math.max(0, (prev[itemId] ?? 0) + delta)
    }));
  };

  // 直接数値入力
  const handleQuantityInput = (itemId, value) => {
    const val = Math.max(0, parseInt(value) || 0);
    setEditedQuantities(prev => ({
      ...prev,
      [itemId]: val
    }));
  };

  // 確認モーダルを開く
  const openConfirmModal = (item) => {
    setConfirmModalItem(item);
  };

  // 確認モーダルを閉じる
  const closeConfirmModal = () => {
    setConfirmModalItem(null);
  };

  // Supabaseへ更新実行
  const handleConfirmUpdate = async () => {
    if (!confirmModalItem) return;

    setIsUpdating(true);
    const targetItem = confirmModalItem;
    const newQuantity = editedQuantities[targetItem.id] ?? targetItem.quantity;
    const diff = newQuantity - targetItem.quantity;

    try {
      const { error: updateErr } = await supabase
        .from('items')
        .update({ quantity: newQuantity })
        .eq('id', targetItem.id);

      if (updateErr) throw updateErr;

      await supabase.from('stock_logs').insert([
        {
          item_id: targetItem.id,
          change_amount: diff,
          note: '確認ダイアログからの在庫更新'
        }
      ]);

      closeConfirmModal();
      fetchData();
    } catch (err) {
      console.error('Update failed:', err);
      alert('更新に失敗しました。');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl shadow-lg w-full max-w-sm text-center">
          <div className="text-3xl mb-2">🏨</div>
          <h1 className="text-xl font-bold text-slate-800 mb-4">ホテル消耗品在庫管理</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="パスコードを入力 (1234)"
                value={passInput}
                onChange={(e) => setPassInput(e.target.value)}
                className="w-full text-center text-lg p-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              {passError && <p className="text-red-500 text-xs mt-1">パスコードが違います</p>}
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition shadow"
            >
              ログイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  const filteredItems = selectedLocation === 'ALL'
    ? items
    : items.filter(i => String(i.location_id) === String(selectedLocation));

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* ヘッダー */}
      <header className="bg-white border-b px-4 py-3 sticky top-0 z-10 flex justify-between items-center shadow-sm">
        <div className="flex items-center space-x-2">
          <span className="text-xl">🏨</span>
          <h1 className="font-bold text-slate-800 text-base sm:text-lg">在庫管理</h1>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-slate-500 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
        >
          ログアウト
        </button>
      </header>

      {/* 拠点フィルター */}
      <div className="p-4 max-w-2xl mx-auto">
        <div className="flex space-x-2 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedLocation('ALL')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition ${
              selectedLocation === 'ALL'
                ? 'bg-blue-600 text-white shadow'
                : 'bg-white text-slate-600 border'
            }`}
          >
            全拠点 ({items.length})
          </button>
          {locations.map((loc) => {
            const count = items.filter(i => String(i.location_id) === String(loc.id)).length;
            return (
              <button
                key={loc.id}
                onClick={() => setSelectedLocation(String(loc.id))}
                className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition ${
                  String(selectedLocation) === String(loc.id)
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-white text-slate-600 border'
                }`}
              >
                {loc.name} ({count})
              </button>
            );
          })}
        </div>

        {/* 商品一覧 */}
        {loading ? (
          <div className="text-center py-10 text-slate-400">データを読み込み中...</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-10 text-slate-400">該当する消耗品はありません</div>
        ) : (
          <div className="grid gap-3 mt-2">
            {filteredItems.map((item) => {
              const currentQty = editedQuantities[item.id] ?? item.quantity;
              const isChanged = currentQty !== item.quantity;
              const isLow = currentQty <= (item.min_quantity || 0);

              return (
                <div
                  key={item.id}
                  className={`bg-white p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between shadow-sm gap-3 ${
                    isLow ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
                  }`}
                >
                  {/* 商品名・拠点 */}
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">
                        {item.locations?.name || '不明'}
                      </span>
                      {isLow && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md font-bold">
                          ⚠️ 要補充
                        </span>
                      )}
                    </div>
                    <h2 className="font-bold text-slate-800 text-lg mt-1">{item.name}</h2>
                    <p className="text-xs text-slate-400">発注目安: {item.min_quantity || 0} {item.unit || '個'}</p>
                  </div>

                  {/* 数量操作 ＆ 常時表示の更新ボタン */}
                  <div className="flex items-center justify-between sm:justify-end space-x-3">
                    {/* +/- 操作ボタン */}
                    <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-1">
                      <button
                        onClick={() => handleQuantityChange(item.id, -1)}
                        className="w-9 h-9 bg-white rounded-lg shadow-sm border text-slate-700 font-bold text-lg hover:bg-slate-100 active:scale-95 transition"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        value={currentQty}
                        onChange={(e) => handleQuantityInput(item.id, e.target.value)}
                        className="w-14 text-center font-black text-lg bg-transparent text-slate-800 focus:outline-none"
                      />
                      <button
                        onClick={() => handleQuantityChange(item.id, 1)}
                        className="w-9 h-9 bg-white rounded-lg shadow-sm border text-slate-700 font-bold text-lg hover:bg-slate-100 active:scale-95 transition"
                      >
                        +
                      </button>
                    </div>

                    {/* 常時表示される更新ボタン */}
                    <button
                      onClick={() => openConfirmModal(item)}
                      className={`px-4 py-2.5 rounded-xl font-bold text-sm transition shadow-sm ${
                        isChanged
                          ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 ring-2 ring-blue-300'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300 active:scale-95'
                      }`}
                    >
                      {isChanged ? '更新する' : '更新'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 🟢 更新確認ダイアログ (モーダル) */}
      {confirmModalItem && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="text-4xl">❓</div>
            <div>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                {confirmModalItem.locations?.name}
              </span>
              <h3 className="text-lg font-bold text-slate-800 mt-1">{confirmModalItem.name}</h3>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border text-slate-700">
              <p className="text-xs text-slate-500 mb-1">在庫数を以下の通り更新しますか？</p>
              <div className="flex items-center justify-center space-x-3 text-lg font-bold">
                <span className="text-slate-400 line-through">{confirmModalItem.quantity}</span>
                <span>➔</span>
                <span className="text-2xl font-black text-blue-600">
                  {editedQuantities[confirmModalItem.id] ?? confirmModalItem.quantity} {confirmModalItem.unit || '個'}
                </span>
              </div>
            </div>

            {/* ダイアログ内ボタン */}
            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={closeConfirmModal}
                className="flex-1 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 transition"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirmUpdate}
                disabled={isUpdating}
                className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 shadow transition disabled:opacity-50"
              >
                {isUpdating ? '更新中...' : '更新する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}