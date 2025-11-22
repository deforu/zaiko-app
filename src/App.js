import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import './App.css';

import { Settings } from './Settings';

// Chart.js の必要なコンポーネントを登録
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);


// --- 定数 ---
const MATERIALS_KEY = 'inventoryMaterialsV2';
const RECIPES_KEY = 'inventoryRecipesV2';
const SALES_KEY = 'inventorySalesV1';

// --- ローカルストレージ操作 ---
function loadFromStorage(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (e) {
    console.error(`${key} の読み込みに失敗しました`, e);
    return fallback;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`${key} の保存に失敗しました`, e);
  }
}

// --- 日付ヘルパー ---
function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
// YYYY-MM-DD形式の文字列をDateオブジェクトに変換（タイムゾーンを考慮）
function parseDateString(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  // 日本時間の0時として解釈
  return new Date(year, month - 1, day);
}


function App() {
  // --- ステート定義 ---
  const [materials, setMaterials] = useState([]);
  const [recipes, setRecipes] =useState([]);
  const [salesLog, setSalesLog] = useState([]);
  const [activeTab, setActiveTab] = useState('materials');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // --- ID管理 ---
  const [nextMaterialId, setNextMaterialId] = useState(1);
  const [nextRecipeId, setNextRecipeId] = useState(1);
  const [nextSaleId, setNextSaleId] = useState(1);

  // --- 初期ロード (useEffect) ---
  useEffect(() => {
    const loadedMaterials = loadFromStorage(MATERIALS_KEY, []).map(m => ({ ...m, consumed: m.consumed ?? 0 }));
    setMaterials(loadedMaterials);
    if (loadedMaterials.length > 0) {
      setNextMaterialId(Math.max(...loadedMaterials.map(m => m.id), 0) + 1);
    }

    const loadedRecipes = loadFromStorage(RECIPES_KEY, []).map(r => ({ ...r, soldCount: r.soldCount ?? 0, price: r.price ?? 0 }));
    setRecipes(loadedRecipes);
    if (loadedRecipes.length > 0) {
      setNextRecipeId(Math.max(...loadedRecipes.map(r => r.id), 0) + 1);
    }

    const loadedSales = loadFromStorage(SALES_KEY, []);
    setSalesLog(loadedSales);
    if (loadedSales.length > 0) {
      setNextSaleId(Math.max(...loadedSales.map(s => s.id), 0) + 1);
    }
  }, []);

  // --- データ保存 (useEffect) ---
  useEffect(() => { saveToStorage(MATERIALS_KEY, materials); }, [materials]);
  useEffect(() => { saveToStorage(RECIPES_KEY, recipes); }, [recipes]);
  useEffect(() => { saveToStorage(SALES_KEY, salesLog); }, [salesLog]);


  // --- 材料関連ハンドラ ---
  const handleAddMaterial = (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.elements['material-name'].value.trim();
    const stock = parseInt(form.elements['material-stock'].value, 10);
    const deadline = parseInt(form.elements['material-deadline'].value, 10) || 5;

    if (!name || isNaN(stock) || stock < 0) {
      alert('材料名と正しい在庫数を入力してください。');
      return;
    }

    const newMaterial = { id: nextMaterialId, name, stock, deadline, consumed: 0 };
    setMaterials(prev => [...prev, newMaterial]);
    setNextMaterialId(prev => prev + 1);
    form.reset();
    form.elements['material-deadline'].value = '5';
  };

  const handleStockIn = (materialId, qty) => {
    if (isNaN(qty) || qty <= 0) {
      alert('入庫数は1以上の数値を入力してください。');
      return;
    }
    setMaterials(prev =>
      prev.map(m =>
        m.id === materialId ? { ...m, stock: m.stock + qty } : m
      )
    );
  };
  
  const handleDeleteMaterial = (materialId) => {
    // この材料を使用しているレシピがあるか確認
    const isMaterialInUse = recipes.some(recipe => 
      recipe.items.some(item => item.materialId === materialId)
    );
    
    if (isMaterialInUse) {
      alert('この材料は品名に登録されているため削除できません。先に品名からこの材料を削除してください。');
      return;
    }

    if (window.confirm('この材料を削除してもよろしいですか？')) {
      setMaterials(prev => prev.filter(m => m.id !== materialId));
    }
  };

  // --- 品名関連ハンドラ ---
  const handleSellRecipe = (recipe, qty) => {
    if (isNaN(qty) || qty <= 0) {
      alert('売れた数は1以上の数値を入力してください。');
      return;
    }

    for (const item of recipe.items) {
      const material = materials.find(m => m.id === item.materialId);
      // 小数点以下の在庫も考慮
      if (!material || material.stock < item.qty * qty) {
        alert(`材料「${material?.name || '不明'}」の在庫が不足しています。（必要: ${item.qty * qty} / 現在: ${material?.stock || 0}）`);
        return;
      }
    }

    setMaterials(prev => prev.map(m => {
      const item = recipe.items.find(i => i.materialId === m.id);
      if (item) {
        const used = item.qty * qty;
        return { ...m, stock: m.stock - used, consumed: (m.consumed || 0) + used };
      }
      return m;
    }));

    setRecipes(prev => prev.map(r =>
      r.id === recipe.id ? { ...r, soldCount: (r.soldCount || 0) + qty } : r
    ));

    const newSale = {
      id: nextSaleId,
      recipeId: recipe.id,
      qty,
      pricePerUnit: recipe.price || 0,
      date: getTodayKey(),
    };
    setSalesLog(prev => [...prev, newSale]);
    setNextSaleId(prev => prev + 1);
  };

  const handleDeleteRecipe = (recipeId) => {
    if (window.confirm('この品名を削除してもよろしいですか？')) {
      setRecipes(prev => prev.filter(r => r.id !== recipeId));
      // 削除された品名に関連する売上ログも削除
      setSalesLog(prev => prev.filter(sale => sale.recipeId !== recipeId));
    }
  };

  return (
    <>
      <div className="header">
        <h1>在庫＆品名管理システム</h1>
        <button onClick={() => setIsSettingsOpen(true)} className="settings-button">
          ⚙️
        </button>
      </div>

      {isSettingsOpen && (
        <Settings
          materials={materials}
          recipes={recipes}
          salesLog={salesLog}
          setMaterials={setMaterials}
          setRecipes={setRecipes}
          setSalesLog={setSalesLog}
          setNextMaterialId={setNextMaterialId}
          setNextRecipeId={setNextRecipeId}
          setNextSaleId={setNextSaleId}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      <StatsView salesLog={salesLog} recipes={recipes} />

      <div className="card">
        <div className="tabs">
          <button className={`tab-button ${activeTab === 'materials' ? 'active' : ''}`} onClick={() => setActiveTab('materials')}>
            材料項目
          </button>
          <button className={`tab-button ${activeTab === 'recipes' ? 'active' : ''}`} onClick={() => setActiveTab('recipes')}>
            品名項目
          </button>
        </div>

        {activeTab === 'materials' && (
          <div id="tab-materials" className="tab-content active">
            <MaterialForm onSubmit={handleAddMaterial} />
            <hr style={{ margin: '16px 0' }} />
            <h3>材料一覧</h3>
            <MaterialsTable materials={materials} onStockIn={handleStockIn} onDelete={handleDeleteMaterial} />
            <p className="hint">在庫数がデッドライン以下になると赤く表示されます。</p>
            <p className="danger">※ ブラウザのキャッシュ削除や別ブラウザを使うとデータは引き継がれません。</p>
          </div>
        )}

        {activeTab === 'recipes' && (
          <div id="tab-recipes" className="tab-content active">
            <RecipeForm materials={materials} setRecipes={setRecipes} nextRecipeId={nextRecipeId} setNextRecipeId={setNextRecipeId} />
            <hr style={{ margin: '16px 0' }} />
            <h3>登録済みの品名プリセット</h3>
            <RecipesTable recipes={recipes} materials={materials} onSell={handleSellRecipe} onDelete={handleDeleteRecipe} />
            <p className="hint">「売れた」数だけ、対応する材料の在庫数が減り、消費数に反映されます。</p>
          </div>
        )}
      </div>
    </>
  );
}

// --- 統計コンポーネント ---
const StatsView = ({ salesLog, recipes }) => {
    const [filterType, setFilterType] = useState('today'); // 'today', 'all', 'custom'
    const [startDate, setStartDate] = useState(getTodayKey());
    const [endDate, setEndDate] = useState(getTodayKey());

    const stats = useMemo(() => {
        const todayKey = getTodayKey();
        let filteredLog = salesLog;

        if (filterType === 'today') {
            filteredLog = salesLog.filter(sale => sale.date === todayKey);
        } else if (filterType === 'custom') {
            const start = parseDateString(startDate);
            const end = parseDateString(endDate);
            end.setHours(23, 59, 59, 999); 

            if (!startDate || !endDate || start > end) {
                 return { summary: { totalQty: 0, totalSales: 0 }, items: [] };
            }

            filteredLog = salesLog.filter(sale => {
                const saleDate = parseDateString(sale.date);
                return saleDate >= start && saleDate <= end;
            });
        }

        const summary = { totalQty: 0, totalSales: 0 };
        const perRecipe = new Map();

        filteredLog.forEach(sale => {
            const saleAmount = sale.qty * sale.pricePerUnit;
            summary.totalQty += sale.qty;
            summary.totalSales += saleAmount;
            const recipe = recipes.find(r => r.id === sale.recipeId);
            const name = recipe ? recipe.name : '(削除済みの品名)';
            const entry = perRecipe.get(sale.recipeId) || { name, qty: 0, sales: 0 };
            entry.qty += sale.qty;
            entry.sales += saleAmount;
            perRecipe.set(sale.recipeId, entry);
        });

        return { summary, items: Array.from(perRecipe.values()) };
    }, [salesLog, recipes, filterType, startDate, endDate]);

    const chartData = {
        labels: stats.items.map(item => item.name),
        datasets: [
            {
                label: '売上合計',
                data: stats.items.map(item => item.sales),
                backgroundColor: 'rgba(37, 99, 235, 0.6)',
                borderColor: 'rgba(37, 99, 235, 1)',
                borderWidth: 1,
            },
            {
                label: '売れた数',
                data: stats.items.map(item => item.qty),
                backgroundColor: 'rgba(249, 115, 22, 0.6)',
                borderColor: 'rgba(249, 115, 22, 1)',
                borderWidth: 1,
            },
        ],
    };

    const pieChartData = {
        labels: stats.items.map(item => item.name),
        datasets: [{
            data: stats.items.map(item => item.sales),
            backgroundColor: [
                'rgba(5, 150, 105, 0.7)', 'rgba(219, 39, 119, 0.7)', 'rgba(245, 158, 11, 0.7)',
                'rgba(107, 114, 128, 0.7)', 'rgba(67, 56, 202, 0.7)', 'rgba(220, 38, 38, 0.7)'
            ],
        }],
    };

    return (
        <div className="card">
            <h2>売上統計</h2>
            <div className="sub-control filter-controls">
                <button onClick={() => setFilterType('today')} className={filterType === 'today' ? 'active' : ''}>今日</button>
                <button onClick={() => setFilterType('all')} className={filterType === 'all' ? 'active' : ''}>全体</button>
                <button onClick={() => setFilterType('custom')} className={filterType === 'custom' ? 'active' : ''}>期間指定</button>
                {filterType === 'custom' && (
                    <div className="date-range-picker">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <span>～</span>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                )}
            </div>

            <div className="stats-grid">
                <div className="stat-item">
                    <div className="stat-label">売れた合計数</div>
                    <div className="stat-value">{stats.summary.totalQty}</div>
                </div>
                <div className="stat-item">
                    <div className="stat-label">売上合計</div>
                    <div className="stat-value">{stats.summary.totalSales}円</div>
                </div>
            </div>

            {stats.items.length > 0 ? (
                <div className="chart-container">
                    <div className="chart-wrapper">
                        <h3>品名ごとの売上</h3>
                        <Bar data={chartData} options={{ responsive: true, plugins: { title: { display: true, text: '品名ごとの売上・販売数' } } }} />
                    </div>
                    <div className="chart-wrapper">
                        <h3>売上割合</h3>
                        <Pie data={pieChartData} options={{ responsive: true, plugins: { title: { display: true, text: '品名ごとの売上割合' } } }}/>
                    </div>
                </div>
            ) : (
                <p className="hint" style={{textAlign: 'center', margin: '20px 0'}}>該当する売上データがありません。</p>
            )}
        </div>
    );
};


// --- サブコンポーネント ---
const MaterialForm = ({ onSubmit }) => (
  <form id="material-form" onSubmit={onSubmit} style={{ marginTop: '8px', marginBottom: '12px' }}>
    <h2>材料登録</h2>
    <div className="form-row">
      <div>
        <label htmlFor="material-name">材料名</label>
        <input type="text" id="material-name" required placeholder="例：玉ねぎ" />
      </div>
      <div>
        <label htmlFor="material-stock">初期在庫数</label>
        <input type="number" id="material-stock" required min="0" defaultValue="0" />
      </div>
      <div>
        <label htmlFor="material-deadline">デッドライン（この数以下で赤表示）</label>
        <input type="number" id="material-deadline" min="0" defaultValue="5" />
      </div>
    </div>
    <button type="submit" className="btn-primary">材料を追加</button>
  </form>
);

const MaterialsTable = ({ materials, onStockIn, onDelete }) => {
  const handleStockInClick = (e, materialId) => {
    const input = e.target.previousElementSibling;
    const qty = parseInt(input.value, 10);
    onStockIn(materialId, qty);
  };

  return (
    <table>
      <thead>
        <tr>
          <th>材料名</th>
          <th>在庫数</th>
          <th>デッドライン</th>
          <th>消費数</th>
          <th>入庫</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {materials.map(material => (
          <tr key={material.id} className={material.stock <= material.deadline ? 'low-stock' : ''}>
            <td>{material.name}</td>
            <td>{material.stock}</td>
            <td>{material.deadline}</td>
            <td>{material.consumed || 0}</td>
            <td>
              <div className="flex-center">
                <input type="number" min="1" defaultValue="1" className="small-input" />
                <button
                  className="btn-in"
                  onClick={(e) => handleStockInClick(e, material.id)}
                >
                  入庫
                </button>
              </div>
            </td>
            <td>
              <button onClick={() => onDelete(material.id)} className="btn-danger">削除</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const RecipeForm = ({ materials, setRecipes, nextRecipeId, setNextRecipeId }) => {
  const [recipeItems, setRecipeItems] = useState([{ materialId: '', qty: 1 }]);

  const addRecipeRow = () => {
    setRecipeItems(prev => [...prev, { materialId: '', qty: 1 }]);
  };

  const removeRecipeRow = (index) => {
    setRecipeItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...recipeItems];
    updated[index][field] = parseFloat(value); // parseFloatに変更
    setRecipeItems(updated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.elements['recipe-name'].value.trim();
    const price = parseFloat(form.elements['recipe-price'].value) || 0;

    if (!name) {
      alert('品名（料理名）を入力してください。');
      return;
    }

    const items = recipeItems
      .map(item => ({
        materialId: parseInt(item.materialId, 10),
        qty: parseFloat(item.qty), // parseFloatに変更
      }))
      .filter(item => !isNaN(item.materialId) && item.materialId && !isNaN(item.qty) && item.qty > 0);

    if (items.length === 0) {
      alert('使用する材料を1つ以上設定してください。');
      return;
    }

    const newRecipe = { id: nextRecipeId, name, price, items, soldCount: 0 };
    setRecipes(prev => [...prev, newRecipe]);
    setNextRecipeId(prev => prev + 1);

    form.reset();
    setRecipeItems([{ materialId: '', qty: 1 }]);
  };


  return (
    <form id="recipe-form" onSubmit={handleSubmit}>
      <h2>品名プリセット（料理）</h2>
      <div className="form-row">
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label htmlFor="recipe-name">品名（料理名）</label>
          <input type="text" id="recipe-name" required placeholder="例：焼きそば" />
        </div>
      </div>

      <div>
        <label>使用材料</label>
        {recipeItems.map((item, index) => (
          <div key={index} className="recipe-row">
            <select
              value={item.materialId}
              onChange={e => handleItemChange(index, 'materialId', e.target.value)}
              className="recipe-material-select"
            >
              <option value="">（材料を選択）</option>
              {materials.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <input
              type="number"
              // min="1"  min属性を削除
              value={item.qty}
              onChange={e => handleItemChange(index, 'qty', e.target.value)}
              className="small-input"
            />
            <button
              type="button"
              onClick={() => removeRecipeRow(index)}
              style={{ background: '#ef4444', color: '#fff', fontSize: '12px' }}
            >
              －
            </button>
          </div>
        ))}
        <button type="button" onClick={addRecipeRow} className="btn-add-row">＋ 材料行を追加</button>
      </div>

      <div className="form-row" style={{ marginTop: '12px' }}>
        <div style={{ width: '200px', minWidth: '180px' }}>
          <label htmlFor="recipe-price">売値（1個あたり）</label>
          <input type="number" id="recipe-price" min="0" defaultValue="0" />
        </div>
      </div>

      <div style={{ marginTop: '12px' }}>
        <button type="submit" className="btn-primary">品名プリセットを登録</button>
      </div>
      <p className="hint">例：「うどん 2個」＋「野菜 1個」で「焼きそば」など、簡単なレシピの登録に使えます。</p>
    </form>
  );
};

const RecipesTable = ({ recipes, materials, onSell, onDelete }) => {
  const getMaterialInfo = useCallback((id) => {
      const material = materials.find(m => m.id === id);
      if (!material) return { name: `不明(ID:${id})`, isLow: false };
      return {
          name: material.name,
          isLow: material.stock <= material.deadline,
      };
  }, [materials]);

  return (
    <table>
      <thead>
        <tr>
          <th>品名</th>
          <th>材料内訳</th>
          <th>売値</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {recipes.map(recipe => (
          <tr key={recipe.id}>
            <td>{recipe.name}<br/><span className="hint">売れた数: {recipe.soldCount || 0}</span></td>
            <td>
              {recipe.items.map(item => {
                const { name, isLow } = getMaterialInfo(item.materialId);
                const badgeClassName = `badge ${isLow ? 'low-stock-badge' : ''}`;
                return (
                  <span key={item.materialId} className={badgeClassName}>
                    {name} × {item.qty}
                  </span>
                );
              })}
            </td>
            <td>{recipe.price}</td>
            <td>
              <div className="flex-center">
                <button
                  className="btn-primary"
                  onClick={() => onSell(recipe, 1)} // 常に1個販売
                >
                  売れた
                </button>
                <button onClick={() => onDelete(recipe.id)} className="btn-danger" style={{ marginLeft: '4px' }}>削除</button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default App;