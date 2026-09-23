import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { 
  Package, 
  AlertTriangle, 
  Search, 
  RefreshCw, 
  MapPin, 
  Plus, 
  Minus, 
  Layers,
  CheckCircle2,
  Building2,
  Check,
  Settings,
  Edit,
  Trash2,
  X,
  PlusCircle
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory' | 'master'
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('すべて');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showToast, setShowToast] = useState(false);

  // モーダル用ステート
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemFormData, setItemFormData] = useState({
    name: '',
    category: 'アメニティ',
    location_id: '',
    stock_quantity: 0,
    reorder_point: 10,
    unit: '個',
    jan_code: ''
  });

  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationName, setLocationName] = useState('');

  // 1. データ取得 (アイテム ＆ 保管場所)
  const fetchAllData = useCallback(async (isManual = false) => {
    setLoading(true);
    try {
      const [itemsRes, locsRes] = await Promise.all([
        supabase.from('items').select('*, locations(name)').order('name', { ascending: true }),
        supabase.from('locations').select('*').order('name', { ascending: true })
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (locsRes.error) throw locsRes.error;

      setItems(itemsRes.data || []);
      setLocations(locsRes.data || []);

      const now = new Date();
      setLastUpdated(now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      if (isManual) {
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2000);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(() => fetchAllData(false), 30000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // 2. 在庫数変更 ＆ ログ記録
  const handleStockChange = async (item, delta) => {
    const newStock = Math.max(0, item.stock_quantity + delta);
    setItems(prevItems =>
      prevItems.map(i => i.id === item.id ? { ...i, stock_quantity: newStock } : i)
    );

    try {
      const { error: updateError } = await supabase
        .from('items')
        .update({ stock_quantity: newStock })
        .eq('id', item.id);

      if (updateError) throw updateError;

      await supabase.from('stock_logs').insert({
        item_id: item.id,
        change_qty: delta,
        type: delta < 0 ? 'consumption' : 'restock',
        staff_name: 'フロントスタッフ'
      });
    } catch (error) {
      console.error('在庫更新エラー:', error);
      alert('在庫の更新に失敗しました');
      fetchAllData();
    }
  };

  // 3. アイテムの追加・編集・削除
  const handleOpenItemModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setItemFormData({
        name: item.name || '',
        category: item.category || 'アメニティ',
        location_id: item.location_id || (locations[0]?.id || ''),
        stock_quantity: item.stock_quantity || 0,
        reorder_point: item.reorder_point || 10,
        unit: item.unit || '個',
        jan_code: item.jan_code || ''
      });
    } else {
      setEditingItem(null);
      setItemFormData({
        name: '',
        category: 'アメニティ',
        location_id: locations[0]?.id || '',
        stock_quantity: 0,
        reorder_point: 10,
        unit: '個',
        jan_code: ''
      });
    }
    setIsItemModalOpen(true);
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!itemFormData.name) return alert('品名を入力してください');

    try {
      if (editingItem) {
        const { error } = await supabase
          .from('items')
          .update(itemFormData)
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('items')
          .insert([itemFormData]);
        if (error) throw error;
      }
      setIsItemModalOpen(false);
      fetchAllData(true);
    } catch (error) {
      console.error('アイテム保存エラー:', error);
      alert('保存に失敗しました');
    }
  };

  const handleDeleteItem = async (id) => {
    if (!window.confirm('この品目を削除しますか？')) return;
    try {
      const { error } = await supabase.from('items').delete().eq('id', id);
      if (error) throw error;
      fetchAllData(true);
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました（ログが存在する可能性があります）');
    }
  };

  // 4. 保管場所の追加・編集・削除
  const handleOpenLocationModal = (loc = null) => {
    if (loc) {
      setEditingLocation(loc);
      setLocationName(loc.name);
    } else {
      setEditingLocation(null);
      setLocationName('');
    }
    setIsLocationModalOpen(true);
  };

  const handleSaveLocation = async (e) => {
    e.preventDefault();
    if (!locationName) return alert('保管場所名を入力してください');

    try {
      if (editingLocation) {
        const { error } = await supabase
          .from('locations')
          .update({ name: locationName })
          .eq('id', editingLocation.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('locations')
          .insert([{ name: locationName }]);
        if (error) throw error;
      }
      setIsLocationModalOpen(false);
      fetchAllData(true);
    } catch (error) {
      console.error('保管場所保存エラー:', error);
      alert('保存に失敗しました');
    }
  };

  const handleDeleteLocation = async (id) => {
    if (!window.confirm('この保管場所を削除しますか？')) return;
    try {
      const { error } = await supabase.from('locations').delete().eq('id', id);
      if (error) throw error;
      fetchAllData(true);
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました（品目が紐づいている可能性があります）');
    }
  };

  // フィルター
  const categories = ['すべて', ...Array.from(new Set(items.map(i => i.category)))];
  const filteredItems = items.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.jan_code && item.jan_code.includes(searchQuery)) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'すべて' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const lowStockCount = items.filter(i => i.stock_quantity <= i.reorder_point).length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 pb-20 font-sans relative">
      
      {/* 1. ヘッダー */}
      <header className="sticky top-0 z-20 bg-indigo-700 text-white px-4 py-3 shadow-md">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-800/80 rounded-xl border border-indigo-500/40">
              <Building2 className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-wide text-white">
                ホテル消耗品 在庫Navi
              </h1>
              <p className="text-[10px] text-indigo-200">
                {lastUpdated ? `最終更新: ${lastUpdated}` : 'リアルタイム管理'}
              </p>
            </div>
          </div>

          <button 
            onClick={() => fetchAllData(true)} 
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl border border-indigo-400/40 transition text-xs font-bold shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            更新
          </button>
        </div>

        {/* タブ切替ナビゲーション */}
        <div className="max-w-md mx-auto flex mt-3 bg-indigo-800/50 p-1 rounded-xl gap-1">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'inventory' 
                ? 'bg-white text-indigo-800 shadow-sm' 
                : 'text-indigo-100 hover:bg-indigo-600/50'
            }`}
          >
            <Package className="w-3.5 h-3.5" /> 在庫入力
          </button>
          <button
            onClick={() => setActiveTab('master')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'master' 
                ? 'bg-white text-indigo-800 shadow-sm' 
                : 'text-indigo-100 hover:bg-indigo-600/50'
            }`}
          >
            <Settings className="w-3.5 h-3.5" /> マスター設定
          </button>
        </div>
      </header>

      {/* 2. トースト通知 */}
      {showToast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 text-white text-xs px-4 py-2 rounded-full shadow-lg border border-slate-700 flex items-center gap-1.5 animate-bounce">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          最新のデータを取得しました
        </div>
      )}

      <main className="max-w-md mx-auto p-4 space-y-4">

        {/* --- タブ 1: 在庫入力画面 --- */}
        {activeTab === 'inventory' && (
          <>
            {/* ステータス概要 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 block font-medium">登録品目数</span>
                  <span className="text-2xl font-black text-slate-800">{items.length} <span className="text-xs font-normal text-slate-500">品</span></span>
                </div>
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                  <Layers className="w-5 h-5" />
                </div>
              </div>

              <div className={`border rounded-2xl p-3.5 shadow-sm flex items-center justify-between transition ${
                lowStockCount > 0 
                  ? 'bg-amber-50/80 border-amber-300 text-amber-900' 
                  : 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
              }`}>
                <div>
                  <span className="text-xs text-slate-500 block font-medium">要発注アラート</span>
                  <span className={`text-2xl font-black ${lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {lowStockCount} <span className="text-xs font-normal text-slate-500">品</span>
                  </span>
                </div>
                <div className={`p-2.5 rounded-xl border ${
                  lowStockCount > 0 
                    ? 'bg-amber-100 text-amber-600 border-amber-200 animate-pulse' 
                    : 'bg-emerald-100 text-emerald-600 border-emerald-200'
                }`}>
                  {lowStockCount > 0 ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                </div>
              </div>
            </div>

            {/* 検索 ＆ カテゴリタブ */}
            <div className="space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="品名・カテゴリ・コードで検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition shadow-sm"
                />
              </div>

              <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-1.5 rounded-xl whitespace-nowrap font-bold transition ${
                      selectedCategory === cat
                        ? 'bg-indigo-600 text-white shadow-sm border border-indigo-600'
                        : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 shadow-sm'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* 在庫カードリスト */}
            {filteredItems.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-400 text-sm shadow-sm">
                該当する消耗品が見つかりません
              </div>
            ) : (
              <div className="space-y-3.5">
                {filteredItems.map(item => {
                  const isLowStock = item.stock_quantity <= item.reorder_point;

                  return (
                    <div 
                      key={item.id} 
                      className={`relative overflow-hidden bg-white rounded-2xl p-4 shadow-sm border transition ${
                        isLowStock 
                          ? 'border-amber-300 bg-amber-50/30' 
                          : 'border-slate-200/90 hover:border-indigo-200'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-md">
                            {item.category}
                          </span>
                          <span className="text-[11px] text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {item.locations?.name || '未設定'}
                          </span>
                        </div>

                        {isLowStock && (
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 shrink-0 animate-pulse">
                            <AlertTriangle className="w-3 h-3 text-amber-600" /> 要発注
                          </span>
                        )}
                      </div>

                      <h2 className="font-bold text-slate-800 text-base mb-3 tracking-wide">{item.name}</h2>

                      <div className="flex justify-between items-end pt-3 border-t border-slate-100">
                        <div>
                          <span className="text-[11px] text-slate-400 block mb-0.5 font-medium">
                            目安発注: {item.reorder_point} {item.unit}
                          </span>
                          <div className="flex items-baseline gap-1">
                            <span className={`text-3xl font-black tracking-tight ${
                              isLowStock ? 'text-amber-600' : 'text-slate-800'
                            }`}>
                              {item.stock_quantity}
                            </span>
                            <span className="text-xs font-bold text-slate-500">{item.unit}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleStockChange(item, -10)}
                            className="h-10 px-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-bold transition border border-slate-200"
                          >
                            -10
                          </button>
                          <button
                            onClick={() => handleStockChange(item, -1)}
                            className="h-10 w-10 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-600 rounded-xl text-sm font-bold transition border border-rose-200 flex items-center justify-center"
                          >
                            <Minus className="w-4 h-4 stroke-[2.5]" />
                          </button>
                          <button
                            onClick={() => handleStockChange(item, 1)}
                            className="h-10 w-10 bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-600 rounded-xl text-sm font-bold transition border border-emerald-200 flex items-center justify-center"
                          >
                            <Plus className="w-4 h-4 stroke-[2.5]" />
                          </button>
                          <button
                            onClick={() => handleStockChange(item, 10)}
                            className="h-10 px-2.5 bg-indigo-50 hover:bg-indigo-100 active:scale-95 text-indigo-700 rounded-xl text-xs font-bold transition border border-indigo-200 shadow-sm"
                          >
                            +10
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* --- タブ 2: マスター設定画面 --- */}
        {activeTab === 'master' && (
          <div className="space-y-6">
            
            {/* 1. 品目（アイテム）マスター */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="font-bold text-slate-800 text-base flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-indigo-600" /> 品目マスター登録
                </h2>
                <button
                  onClick={() => handleOpenItemModal()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm"
                >
                  <PlusCircle className="w-4 h-4" /> 品目を追加
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                {items.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">品目が登録されていません</div>
                ) : (
                  items.map(item => (
                    <div key={item.id} className="p-3.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-bold text-slate-800 text-sm">{item.name}</span>
                          <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-100">
                            {item.category}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          保管: {item.locations?.name || '未設定'} | 目安: {item.reorder_point}{item.unit}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenItemModal(item)}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="編集"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 2. 保管場所（ロケーション）マスター */}
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <h2 className="font-bold text-slate-800 text-base flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-indigo-600" /> 保管場所マスター
                </h2>
                <button
                  onClick={() => handleOpenLocationModal()}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm"
                >
                  <PlusCircle className="w-4 h-4" /> 保管場所を追加
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                {locations.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">保管場所が登録されていません</div>
                ) : (
                  locations.map(loc => (
                    <div key={loc.id} className="p-3.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition">
                      <span className="font-bold text-slate-800 text-sm">{loc.name}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenLocationModal(loc)}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="編集"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteLocation(loc.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

      </main>

      {/* --- モーダル: 品目の追加 ＆ 編集 --- */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-indigo-700 text-white flex justify-between items-center">
              <h3 className="font-bold text-base">{editingItem ? '品目の編集' : '新規品目の登録'}</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="text-indigo-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-5 space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-slate-600 mb-1">品名 <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={itemFormData.name}
                  onChange={e => setItemFormData({ ...itemFormData, name: e.target.value })}
                  placeholder="例: フェイスタオル"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">カテゴリ</label>
                  <input
                    type="text"
                    value={itemFormData.category}
                    onChange={e => setItemFormData({ ...itemFormData, category: e.target.value })}
                    placeholder="例: リネン"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">保管場所</label>
                  <select
                    value={itemFormData.location_id}
                    onChange={e => setItemFormData({ ...itemFormData, location_id: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white"
                  >
                    <option value="">未選択</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-600 mb-1">現在の在庫</label>
                  <input
                    type="number"
                    min="0"
                    value={itemFormData.stock_quantity}
                    onChange={e => setItemFormData({ ...itemFormData, stock_quantity: parseInt(e.target.value) || 0 })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">目安発注数</label>
                  <input
                    type="number"
                    min="0"
                    value={itemFormData.reorder_point}
                    onChange={e => setItemFormData({ ...itemFormData, reorder_point: parseInt(e.target.value) || 0 })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">単位</label>
                  <input
                    type="text"
                    value={itemFormData.unit}
                    onChange={e => setItemFormData({ ...itemFormData, unit: e.target.value })}
                    placeholder="枚, 本, 個"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">JANコード（任意）</label>
                <input
                  type="text"
                  value={itemFormData.jan_code}
                  onChange={e => setItemFormData({ ...itemFormData, jan_code: e.target.value })}
                  placeholder="バーコードの番号"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition shadow-md"
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- モーダル: 保管場所の追加 ＆ 編集 --- */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-slate-800 text-white flex justify-between items-center">
              <h3 className="font-bold text-base">{editingLocation ? '保管場所の編集' : '新規保管場所の登録'}</h3>
              <button onClick={() => setIsLocationModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLocation} className="p-5 space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-600 mb-1">保管場所名 <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={locationName}
                  onChange={e => setLocationName(e.target.value)}
                  placeholder="例: 3F リネン室"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsLocationModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition shadow-md"
                >
                  保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}