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
  PlusCircle,
  History,
  Download,
  ClipboardList,
  Copy,
  CheckSquare
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory' | 'history' | 'master'
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [masterSearchQuery, setMasterSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('すべて');
  const [selectedLocation, setSelectedLocation] = useState('すべて');
  const [selectedMasterLocation, setSelectedMasterLocation] = useState('すべて'); // マスター用保管場所フィルター
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showToast, setShowToast] = useState(false);

  // 音声入力用ステート
  const [isListening, setIsListening] = useState(false);

  // 発注リストモーダル用ステート
  const [isOrderListModalOpen, setIsOrderListModalOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // 棚卸しモード用ステート
  const [inventoryCounts, setInventoryCounts] = useState({});
  const [isSavingInventory, setIsSavingInventory] = useState(false);

  // モーダル用ステート（品目）
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemFormData, setItemFormData] = useState({
    name: '',
    category: 'アメニティ',
    location_id: '',
    stock_quantity: 0,
    reorder_point: 10,
    unit: '個'
  });

  // モーダル用ステート（保管場所）
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationName, setLocationName] = useState('');

  // 1. データ取得
  const fetchAllData = useCallback(async (isManual = false) => {
    setLoading(true);
    try {
      const [itemsRes, locsRes, logsRes] = await Promise.all([
        supabase.from('items').select('*, locations(name)').order('name', { ascending: true }),
        supabase.from('locations').select('*').order('name', { ascending: true }),
        supabase.from('stock_logs').select('*, items(name)').order('created_at', { ascending: false }).limit(200)
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (locsRes.error) throw locsRes.error;

      const fetchedItems = itemsRes.data || [];
      setItems(fetchedItems);
      setLocations(locsRes.data || []);
      setLogs(logsRes.data || []);

      const initialCounts = {};
      fetchedItems.forEach(item => {
        initialCounts[item.id] = item.stock_quantity;
      });
      setInventoryCounts(initialCounts);

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

  // 音声入力（Web Speech API）の制御
  const handleVoiceSearch = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('お使いのブラウザは音声入力に対応していません。ChromeやSafariをご利用ください。');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const speechText = event.results[0][0].transcript;
      setSearchQuery(speechText.replace(/[。、！？]/g, ''));
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognition.start();
  };

  const getLocationName = (item) => {
    if (!item.locations) return '未設定';
    if (Array.isArray(item.locations)) return item.locations[0]?.name || '未設定';
    return item.locations.name || '未設定';
  };

  // 在庫数変更
  const handleStockChange = async (item, delta) => {
    const previousStock = item.stock_quantity;
    const newStock = Math.max(0, previousStock + delta);
    if (previousStock === newStock && delta < 0) return;

    setItems(prev => prev.map(i => i.id === item.id ? { ...i, stock_quantity: newStock } : i));
    setInventoryCounts(prev => ({ ...prev, [item.id]: newStock }));

    try {
      const { error: updateError } = await supabase.from('items').update({ stock_quantity: newStock }).eq('id', item.id);
      if (updateError) throw updateError;

      await supabase.from('stock_logs').insert({
        item_id: item.id,
        change_qty: delta,
        type: delta < 0 ? 'consumption' : 'restock',
        staff_name: 'フロントスタッフ'
      });
      fetchAllData();
    } catch (error) {
      console.error('在庫更新エラー:', error);
      alert('在庫の更新に失敗しました。');
      fetchAllData();
    }
  };

  // 棚卸し一括保存処理
  const handleSaveBatchInventory = async () => {
    if (!window.confirm('入力された数値で棚卸しを確定し、在庫数を一括更新しますか？')) return;
    setIsSavingInventory(true);

    try {
      for (const item of items) {
        const newQty = parseInt(inventoryCounts[item.id], 10);
        if (isNaN(newQty) || newQty === item.stock_quantity) continue;

        const delta = newQty - item.stock_quantity;

        const { error: updateError } = await supabase
          .from('items')
          .update({ stock_quantity: newQty })
          .eq('id', item.id);

        if (updateError) throw updateError;

        await supabase.from('stock_logs').insert({
          item_id: item.id,
          change_qty: delta,
          type: delta < 0 ? 'consumption' : 'restock',
          staff_name: '棚卸しスタッフ'
        });
      }

      alert('棚卸しによる在庫の一括更新が完了しました！');
      fetchAllData(true);
    } catch (error) {
      console.error('一括更新エラー:', error);
      alert('一括更新に失敗しました。');
      fetchAllData();
    } finally {
      setIsSavingInventory(false);
    }
  };

  // 品目モーダル処理
  const handleOpenItemModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setItemFormData({
        name: item.name || '',
        category: item.category || 'アメニティ',
        location_id: item.location_id || (locations[0]?.id || ''),
        stock_quantity: item.stock_quantity ?? 0,
        reorder_point: item.reorder_point ?? 10,
        unit: item.unit || '個'
      });
    } else {
      setEditingItem(null);
      setItemFormData({
        name: '', 
        category: 'アメニティ', 
        location_id: locations[0]?.id || '', 
        stock_quantity: 0, 
        reorder_point: 10, 
        unit: '個'
      });
    }
    setIsItemModalOpen(true);
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!itemFormData.name.trim()) return alert('品名を入力してください');
    
    const payload = { 
      ...itemFormData, 
      name: itemFormData.name.trim(), 
      category: itemFormData.category.trim(), 
      unit: itemFormData.unit.trim(),
      location_id: itemFormData.location_id || null
    };

    try {
      if (editingItem) {
        await supabase.from('items').update(payload).eq('id', editingItem.id);
      } else {
        await supabase.from('items').insert([payload]);
      }
      setIsItemModalOpen(false);
      fetchAllData(true);
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました');
    }
  };

  const handleDeleteItem = async (id) => {
    if (!window.confirm('この品目を削除しますか？')) return;
    try {
      await supabase.from('items').delete().eq('id', id);
      fetchAllData(true);
    } catch (error) {
      alert('削除に失敗しました');
    }
  };

  // 保管場所モーダル処理
  const handleOpenLocationModal = (loc = null) => {
    setEditingLocation(loc);
    setLocationName(loc ? loc.name : '');
    setIsLocationModalOpen(true);
  };

  const handleSaveLocation = async (e) => {
    e.preventDefault();
    if (!locationName.trim()) return alert('保管場所名を入力してください');
    try {
      if (editingLocation) {
        await supabase.from('locations').update({ name: locationName.trim() }).eq('id', editingLocation.id);
      } else {
        await supabase.from('locations').insert([{ name: locationName.trim() }]);
      }
      setIsLocationModalOpen(false);
      fetchAllData(true);
    } catch (error) {
      alert('保存に失敗しました');
    }
  };

  const handleDeleteLocation = async (id) => {
    if (!window.confirm('この保管場所を削除しますか？')) return;
    try {
      await supabase.from('locations').delete().eq('id', id);
      fetchAllData(true);
    } catch (error) {
      alert('削除に失敗しました');
    }
  };

  const exportLogsToCSV = () => {
    if (logs.length === 0) return alert('出力する履歴データがありません');
    const headers = ['日時', '品名', '種別', '変動数', '担当者'];
    const rows = logs.map(log => [
      log.created_at ? new Date(log.created_at).toLocaleString('ja-JP') : '',
      log.items?.name || '削除された品目',
      log.type === 'consumption' ? '消費' : '補充',
      log.change_qty > 0 ? `+${log.change_qty}` : log.change_qty,
      log.staff_name || 'スタッフ'
    ]);
    const csvContent = '\uFEFF' + [headers, ...rows].map(e => e.map(val => `"${val}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `在庫移動履歴_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 要発注リストの抽出
  const lowStockItems = items.filter(i => i.stock_quantity <= i.reorder_point);
  const lowStockCount = lowStockItems.length;

  const copyOrderListToClipboard = () => {
    const textList = lowStockItems.map(item => `・${item.name}: 現在 ${item.stock_quantity}${item.unit} (目安: ${item.reorder_point}${item.unit}) [保管: ${getLocationName(item)}]`).join('\n');
    const header = `【要発注リスト】 (${new Date().toLocaleDateString('ja-JP')})\n`;
    const fullText = header + (textList || '発注必要なアイテムはありません');

    navigator.clipboard.writeText(fullText).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const categories = ['すべて', ...Array.from(new Set(items.map(i => i.category).filter(Boolean)))];
  const locationTabs = ['すべて', ...locations.map(l => l.name)];

  // 在庫タブ用のフィルタリング
  const filteredItems = items.filter(item => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(query) || (item.category && item.category.toLowerCase().includes(query));
    const matchesCategory = selectedCategory === 'すべて' || item.category === selectedCategory;
    const itemLocName = getLocationName(item);
    const matchesLocation = selectedLocation === 'すべて' || itemLocName === selectedLocation;

    return matchesSearch && matchesCategory && matchesLocation;
  });

  // マスター設定（品目）用のフィルタリング（保管場所 ＋ キーワード）
  const filteredMasterItems = items.filter(item => {
    const query = masterSearchQuery.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(query) || (item.category && item.category.toLowerCase().includes(query));
    const itemLocName = getLocationName(item);
    const matchesLocation = selectedMasterLocation === 'すべて' || itemLocName === selectedMasterLocation;

    return matchesSearch && matchesLocation;
  });

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 pb-20 font-sans relative select-none">
      
      {/* ヘッダー */}
      <header className="sticky top-0 z-20 bg-indigo-700 text-white px-4 py-3 shadow-md">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-800/80 rounded-xl border border-indigo-500/40">
              <Building2 className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-wide text-white">ホテル消耗品 在庫Navi</h1>
              <p className="text-[10px] text-indigo-200">{lastUpdated ? `最終更新: ${lastUpdated}` : 'リアルタイム管理'}</p>
            </div>
          </div>

          <button onClick={() => fetchAllData(true)} disabled={loading} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl border border-indigo-400/40 transition text-xs font-bold shadow-sm disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 更新
          </button>
        </div>

        {/* タブ切替 */}
        <div className="max-w-md mx-auto flex mt-3 bg-indigo-800/50 p-1 rounded-xl gap-1 text-xs font-bold">
          <button onClick={() => setActiveTab('inventory')} className={`flex-1 py-1.5 rounded-lg transition flex items-center justify-center gap-1 ${activeTab === 'inventory' ? 'bg-white text-indigo-800 shadow-sm' : 'text-indigo-100'}`}>
            <Package className="w-3.5 h-3.5" /> 在庫
          </button>
          <button onClick={() => setActiveTab('history')} className={`flex-1 py-1.5 rounded-lg transition flex items-center justify-center gap-1 ${activeTab === 'history' ? 'bg-white text-indigo-800 shadow-sm' : 'text-indigo-100'}`}>
            <History className="w-3.5 h-3.5" /> 履歴・棚卸し
          </button>
          <button onClick={() => setActiveTab('master')} className={`flex-1 py-1.5 rounded-lg transition flex items-center justify-center gap-1 ${activeTab === 'master' ? 'bg-white text-indigo-800 shadow-sm' : 'text-indigo-100'}`}>
            <Settings className="w-3.5 h-3.5" /> 設定
          </button>
        </div>
      </header>

      {/* トースト */}
      {showToast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 text-white text-xs px-4 py-2 rounded-full shadow-lg border border-slate-700 flex items-center gap-1.5 animate-bounce">
          <Check className="w-3.5 h-3.5 text-emerald-400" /> 最新のデータを取得しました
        </div>
      )}

      {/* 音声入力中の通知オーバーレイ */}
      {isListening && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-white space-y-3">
          <div className="w-16 h-16 bg-rose-600 rounded-full flex items-center justify-center animate-ping">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 10v1a7 7 0 01-14 0v-1M12 18.5V22M8 22h8"/></svg>
          </div>
          <p className="text-base font-bold tracking-wide animate-pulse">お話しください...</p>
          <p className="text-xs text-slate-300">例: 「シャンプー」「タオル」など</p>
        </div>
      )}

      <main className="max-w-md mx-auto p-4 space-y-4">

        {/* タブ 1: 在庫入力 */}
        {activeTab === 'inventory' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 block font-medium">登録品目数</span>
                  <span className="text-2xl font-black text-slate-800">{items.length} <span className="text-xs font-normal text-slate-500">品</span></span>
                </div>
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100"><Layers className="w-5 h-5" /></div>
              </div>

              {/* 要発注アラートカード */}
              <div className={`border rounded-2xl p-3.5 shadow-sm flex flex-col justify-between transition ${lowStockCount > 0 ? 'bg-amber-50/90 border-amber-300 text-amber-900' : 'bg-emerald-50/90 border-emerald-300 text-emerald-900'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500 block font-medium">要発注アラート</span>
                    <span className={`text-2xl font-black ${lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{lowStockCount} <span className="text-xs font-normal text-slate-500">品</span></span>
                  </div>
                  <div className={`p-2.5 rounded-xl border ${lowStockCount > 0 ? 'bg-amber-100 text-amber-600 border-amber-200 animate-pulse' : 'bg-emerald-100 text-emerald-600 border-emerald-200'}`}>
                    {lowStockCount > 0 ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                  </div>
                </div>

                {lowStockCount > 0 && (
                  <button 
                    onClick={() => setIsOrderListModalOpen(true)}
                    className="mt-2 w-full py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-[11px] font-bold shadow-sm transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <ClipboardList className="w-3.5 h-3.5" /> 発注リストを見る
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input type="text" placeholder="品名で検索..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 shadow-sm" />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleVoiceSearch}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl flex items-center gap-1.5 text-xs font-extrabold shadow-sm transition shrink-0 cursor-pointer"
                  title="音声で検索"
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 10v1a7 7 0 01-14 0v-1M12 18.5V22M8 22h8"/></svg>
                  音声
                </button>
              </div>

              {/* 保管場所別の絞り込みタブ */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
                <span className="text-[10px] font-bold text-slate-400 shrink-0 pl-0.5 flex items-center gap-0.5"><MapPin className="w-3 h-3" /> 場所:</span>
                {locationTabs.map(loc => (
                  <button key={loc} onClick={() => setSelectedLocation(loc)} className={`px-3 py-1 rounded-lg whitespace-nowrap font-bold transition ${selectedLocation === loc ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'}`}>
                    {loc}
                  </button>
                ))}
              </div>

              {/* カテゴリ別の絞り込みタブ */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
                <span className="text-[10px] font-bold text-slate-400 shrink-0 pl-0.5 flex items-center gap-0.5"><Layers className="w-3 h-3" /> 分類:</span>
                {categories.map(cat => (
                  <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-3.5 py-1.5 rounded-xl whitespace-nowrap font-bold transition ${selectedCategory === cat ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 shadow-sm'}`}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3.5">
              {filteredItems.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-8">該当する品目がありません</p>
              ) : (
                filteredItems.map(item => {
                  const isLowStock = item.stock_quantity <= item.reorder_point;
                  return (
                    <div key={item.id} className={`relative overflow-hidden bg-white rounded-2xl p-4 shadow-sm border transition ${isLowStock ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200/90'}`}>
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-md">{item.category}</span>
                          <span className="text-[11px] text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60"><MapPin className="w-3 h-3 text-slate-400" />{getLocationName(item)}</span>
                        </div>
                        {isLowStock && <span className="text-[11px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 animate-pulse"><AlertTriangle className="w-3 h-3 text-amber-600" /> 要発注</span>}
                      </div>

                      <h2 className="font-bold text-slate-800 text-base mb-3 tracking-wide">{item.name}</h2>

                      <div className="flex justify-between items-end pt-3 border-t border-slate-100">
                        <div>
                          <span className="text-[11px] text-slate-400 block mb-0.5 font-medium">目安発注: {item.reorder_point} {item.unit}</span>
                          <div className="flex items-baseline gap-1">
                            <span className={`text-3xl font-black tracking-tight ${isLowStock ? 'text-amber-600' : 'text-slate-800'}`}>{item.stock_quantity}</span>
                            <span className="text-xs font-bold text-slate-500">{item.unit}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleStockChange(item, -10)} className="h-10 px-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200">-10</button>
                          <button onClick={() => handleStockChange(item, -1)} className="h-10 w-10 bg-rose-50 text-rose-600 rounded-xl text-sm font-bold border border-rose-200 flex items-center justify-center"><Minus className="w-4 h-4 stroke-[2.5]" /></button>
                          <button onClick={() => handleStockChange(item, 1)} className="h-10 w-10 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-bold border border-emerald-200 flex items-center justify-center"><Plus className="w-4 h-4 stroke-[2.5]" /></button>
                          <button onClick={() => handleStockChange(item, 10)} className="h-10 px-2.5 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200 shadow-sm">+10</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* タブ 2: 履歴・棚卸しモード */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            
            <div className="bg-white rounded-2xl border border-indigo-200 p-4 shadow-sm space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <div>
                  <h2 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-indigo-600" /> 棚卸し 一括更新モード
                  </h2>
                  <p className="text-[11px] text-slate-400">実際の数量を入力してまとめて更新できます</p>
                </div>
                <button 
                  onClick={handleSaveBatchInventory} 
                  disabled={isSavingInventory || items.length === 0}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {isSavingInventory ? '保存中...' : '一括保存する'}
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {items.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">登録されている品目がありません</p>
                ) : (
                  items.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200/60">
                      <div>
                        <span className="font-bold text-slate-800 text-xs block">{item.name}</span>
                        <span className="text-[10px] text-slate-400">保管: {getLocationName(item)} / (現在: {item.stock_quantity}{item.unit})</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <input 
                          type="number" 
                          min="0"
                          value={inventoryCounts[item.id] ?? item.stock_quantity}
                          onChange={(e) => setInventoryCounts({ ...inventoryCounts, [item.id]: e.target.value })}
                          className="w-16 p-1.5 bg-white border border-slate-300 rounded-lg text-center font-bold text-slate-800 text-sm focus:outline-none focus:border-indigo-500"
                        />
                        <span className="text-xs text-slate-500 font-medium">{item.unit}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="font-bold text-slate-800 text-base flex items-center gap-1.5"><History className="w-4 h-4 text-indigo-600" /> 在庫変動履歴</h2>
                <button onClick={exportLogsToCSV} className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm cursor-pointer"><Download className="w-3.5 h-3.5" /> CSV出力</button>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {logs.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400 text-center">履歴データがありません</p>
                ) : (
                  logs.map(log => (
                    <div key={log.id} className="p-3.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-bold text-slate-800 text-sm">{log.items?.name || '削除された品目'}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${log.change_qty > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>{log.change_qty > 0 ? `+${log.change_qty}` : log.change_qty}</span>
                        </div>
                        <p className="text-[11px] text-slate-400">{log.created_at ? new Date(log.created_at).toLocaleString('ja-JP') : ''} | {log.staff_name || 'スタッフ'}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* タブ 3: マスター設定 */}
        {activeTab === 'master' && (
          <div className="space-y-6">
            
            {/* 1. 品目マスター */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="font-bold text-slate-800 text-base flex items-center gap-1.5"><Package className="w-4 h-4 text-indigo-600" /> 品目マスター</h2>
                <button onClick={() => handleOpenItemModal()} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl flex items-center gap-1"><PlusCircle className="w-4 h-4" /> 品目を追加</button>
              </div>

              {/* 保管場所別の絞り込みタブ（検索窓の上） */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-xs">
                <span className="text-[10px] font-bold text-slate-400 shrink-0 pl-0.5 flex items-center gap-0.5"><MapPin className="w-3 h-3" /> 場所:</span>
                {locationTabs.map(loc => (
                  <button key={loc} onClick={() => setSelectedMasterLocation(loc)} className={`px-3 py-1 rounded-lg whitespace-nowrap font-bold transition ${selectedMasterLocation === loc ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'}`}>
                    {loc}
                  </button>
                ))}
              </div>

              {/* 品目マスター用 検索窓 */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="品名・カテゴリで絞り込み..." 
                  value={masterSearchQuery} 
                  onChange={(e) => setMasterSearchQuery(e.target.value)} 
                  className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 shadow-sm" 
                />
                {masterSearchQuery && (
                  <button onClick={() => setMasterSearchQuery('')} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden max-h-96 overflow-y-auto">
                {filteredMasterItems.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400 text-center">該当する品目がありません</p>
                ) : (
                  filteredMasterItems.map(item => (
                    <div key={item.id} className="p-3.5 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-bold text-slate-800 text-sm">{item.name}</span>
                          <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{item.category}</span>
                        </div>
                        <p className="text-xs text-slate-400">保管: {getLocationName(item)} | 目安: {item.reorder_point}{item.unit}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => handleOpenItemModal(item)} className="p-2 text-slate-500 hover:text-indigo-600"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteItem(item.id)} className="p-2 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 2. 保管場所マスター */}
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <h2 className="font-bold text-slate-800 text-base flex items-center gap-1.5"><MapPin className="w-4 h-4 text-indigo-600" /> 保管場所マスター</h2>
                <button onClick={() => handleOpenLocationModal()} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl flex items-center gap-1"><PlusCircle className="w-4 h-4" /> 場所を追加</button>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {locations.length === 0 ? (
                  <p className="p-4 text-xs text-slate-400 text-center">保管場所が登録されていません</p>
                ) : (
                  locations.map(loc => (
                    <div key={loc.id} className="p-3.5 flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-sm">{loc.name}</span>
                      <div className="flex gap-1">
                        <button onClick={() => handleOpenLocationModal(loc)} className="p-2 text-slate-500 hover:text-indigo-600"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteLocation(loc.id)} className="p-2 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

      </main>

      {/* 発注リスト確認モーダル */}
      {isOrderListModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden p-5 space-y-4 text-xs font-semibold">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-amber-600" /> 要発注リスト（買い物リスト）
              </h3>
              <button onClick={() => setIsOrderListModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-3 space-y-2 max-h-60 overflow-y-auto divide-y divide-amber-100">
              {lowStockItems.length === 0 ? (
                <p className="text-center text-slate-500 py-4">現在、要発注の品目はありません 🎉</p>
              ) : (
                lowStockItems.map(item => (
                  <div key={item.id} className="pt-2 first:pt-0 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                      <p className="text-[11px] text-slate-500">保管: {getLocationName(item)} | 目安: {item.reorder_point}{item.unit}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-amber-600 font-black text-base">{item.stock_quantity}</span>
                      <span className="text-slate-500 text-xs">{item.unit}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button 
                onClick={copyOrderListToClipboard} 
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-4 h-4" /> {copySuccess ? 'コピーしました！' : 'リストをコピー'}
              </button>
              <button 
                onClick={() => setIsOrderListModalOpen(false)} 
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 品目登録・編集モーダル */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveItem} className="bg-white w-full max-w-md rounded-2xl overflow-hidden p-5 space-y-3 text-xs font-semibold shadow-xl">
            <div className="flex justify-between items-center mb-1">
              <h3 className="font-bold text-sm text-slate-800">{editingItem ? '品目の編集' : '新規品目の登録'}</h3>
              <button type="button" onClick={() => setIsItemModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">品名 <span className="text-rose-500">*</span></label>
              <input 
                type="text" 
                placeholder="例: シャンプー" 
                value={itemFormData.name} 
                onChange={e => setItemFormData({...itemFormData, name: e.target.value})} 
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-indigo-500" 
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">カテゴリ</label>
                <input 
                  type="text" 
                  placeholder="例: アメニティ" 
                  value={itemFormData.category} 
                  onChange={e => setItemFormData({...itemFormData, category: e.target.value})} 
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-indigo-500" 
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">保管場所</label>
                <select 
                  value={itemFormData.location_id} 
                  onChange={e => setItemFormData({...itemFormData, location_id: e.target.value})} 
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">選択してください</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">初期/現在在庫</label>
                <input 
                  type="number" 
                  min="0"
                  value={itemFormData.stock_quantity} 
                  onChange={e => setItemFormData({...itemFormData, stock_quantity: parseInt(e.target.value) || 0})} 
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-indigo-500" 
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">発注目安</label>
                <input 
                  type="number" 
                  min="0"
                  value={itemFormData.reorder_point} 
                  onChange={e => setItemFormData({...itemFormData, reorder_point: parseInt(e.target.value) || 0})} 
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-indigo-500" 
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">単位</label>
                <input 
                  type="text" 
                  placeholder="個, 箱" 
                  value={itemFormData.unit} 
                  onChange={e => setItemFormData({...itemFormData, unit: e.target.value})} 
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-indigo-500" 
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setIsItemModalOpen(false)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer">キャンセル</button>
              <button type="submit" className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-sm transition cursor-pointer">保存</button>
            </div>
          </form>
        </div>
      )}

      {/* 保管場所登録・編集モーダル */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveLocation} className="bg-white w-full max-w-md rounded-2xl overflow-hidden p-5 space-y-3 text-xs font-semibold shadow-xl">
            <div className="flex justify-between items-center mb-1">
              <h3 className="font-bold text-sm text-slate-800">{editingLocation ? '保管場所の編集' : '新規保管場所の登録'}</h3>
              <button type="button" onClick={() => setIsLocationModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">保管場所名 <span className="text-rose-500">*</span></label>
              <input 
                type="text" 
                placeholder="例: 1Fリネン室, フロント倉庫" 
                value={locationName} 
                onChange={e => setLocationName(e.target.value)} 
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-indigo-500" 
                required
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setIsLocationModalOpen(false)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer">キャンセル</button>
              <button type="submit" className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-sm transition cursor-pointer">保存</button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}