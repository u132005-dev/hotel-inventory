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

  // データ取得
  const fetchData = async () => {
    try {
      const { data: locs, error: locErr } = await supabase.from('locations').select('*').order('id');
      if (locErr) throw locErr;
      setLocations(locs || []);

      const { data: itms, error: itmErr } = await supabase.from('items').select('*, locations(name)').order('id');
      if (itmErr) throw itmErr;
      setItems(itms || []);
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
      }, 10000); // 10秒自動更新
      return () => clearInterval(timer);
    }
  }, [authenticated]);

  // パスコード認証
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

  // 即時在庫更新処理 (+/- ボタン押下時)
  const handleQuantityChange = async (item, delta) => {
    const newQty = Math.max(0, item.quantity + delta);
    if (newQty === item.quantity) return;

    // 画面の表示を即時更新（UIのレスポンス向上）
    setItems(prevItems =>
      prevItems.map(i => (i.id === item.id ? { ...i, quantity: newQty } : i))
    );

    try {
      // Supabase更新
      const { error: updateErr } = await supabase
        .from('items')
        .update({ quantity: newQty })
        .eq('id', item.id);

      if (updateErr) throw updateErr;

      // stock_logs テーブルにログ記録
      await supabase.from('stock_logs').insert([
        {
          item_id: item.id,
          change_amount: delta,
          note: '画面操作からの即時更新'
        }
      ]);
    } catch (err) {
      console.error('Update failed:', err);
      alert('在庫数の更新に失敗しました。');
      fetchData(); // 失敗した場合は元のデータに戻す
    }
  };

  // 直接数値入力時の更新処理
  const handleQuantityInput = async (item, value) => {
    const newQty = Math.max(0, parseInt(value) || 0);
    const diff = newQty - item.quantity;
    if (diff === 0) return;

    setItems(prevItems =>
      prevItems.map(i => (i.id === item.id ? { ...i, quantity: newQty } : i))
    );

    try {
      const { error: updateErr } = await supabase
        .from('items')
        .update({ quantity: newQty })
        .eq('id', item.id);

      if (updateErr) throw updateErr;

      await supabase.from('stock_logs').insert([
        {
          item_id: item.id,
          change_amount: diff,
          note: '数値直接入力からの更新'
        }
      ]);
    } catch (err) {
      console.error('Update failed:', err);
      alert('在庫数の更新に失敗しました。');
      fetchData();
    }
  };

  // 未ログイン画面
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

  // 拠点フィルター処理
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
              const isLow = item.quantity <= (item.min_quantity || 0);

              return (
                <div
                  key={item.id}
                  className={`bg-white p-4 rounded-2xl border flex items-center justify-between shadow-sm ${
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

                  {/* 数量操作 (+/- ボタンのみで即時更新) */}
                  <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-1">
                    <button
                      onClick={() => handleQuantityChange(item, -1)}
                      className="w-10 h-10 bg-white rounded-lg shadow-sm border text-slate-700 font-bold text-xl hover:bg-slate-100 active:scale-95 transition"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleQuantityInput(item, e.target.value)}
                      className="w-14 text-center font-black text-lg bg-transparent text-slate-800 focus:outline-none"
                    />
                    <button
                      onClick={() => handleQuantityChange(item, 1)}
                      className="w-10 h-10 bg-white rounded-lg shadow-sm border text-slate-700 font-bold text-xl hover:bg-slate-100 active:scale-95 transition"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}