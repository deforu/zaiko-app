import React from 'react';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export const Settings = ({
  materials,
  recipes,
  salesLog,
  setMaterials,
  setRecipes,
  setSalesLog,
  setNextMaterialId,
  setNextRecipeId,
  setNextSaleId,
  onClose,
}) => {

  const handleExport = async () => {
    try {
      const zip = new JSZip();

      // 1. 材料データ (materials.csv)
      const materialsCsv = Papa.unparse(materials);
      zip.file("materials.csv", materialsCsv);

      // 2. 品名データ (recipes.csv) - itemsをJSON文字列に変換
      const recipesToExport = recipes.map(r => ({
        ...r,
        items: JSON.stringify(r.items),
      }));
      const recipesCsv = Papa.unparse(recipesToExport);
      zip.file("recipes.csv", recipesCsv);

      // 3. 売上ログ (sales_log.csv)
      const salesLogCsv = Papa.unparse(salesLog);
      zip.file("sales_log.csv", salesLogCsv);

      // Zipファイルを生成してダウンロード
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "zaiko_app_backup.zip");

    } catch (error) {
      console.error("エクスポート中にエラーが発生しました:", error);
      alert("エクスポートに失敗しました。");
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.confirm('現在の全てのデータが上書きされます。よろしいですか？')) {
      e.target.value = null; // Reset file input
      return;
    }

    try {
      const zip = await JSZip.loadAsync(file);

      // 各CSVファイルを読み込んでパース
      const materialsFile = zip.file("materials.csv");
      const recipesFile = zip.file("recipes.csv");
      const salesLogFile = zip.file("sales_log.csv");

      if (!materialsFile || !recipesFile || !salesLogFile) {
        throw new Error("バックアップファイルに必要なCSVファイル（materials.csv, recipes.csv, sales_log.csv）が含まれていません。");
      }

      const [materialsText, recipesText, salesLogText] = await Promise.all([
        materialsFile.async("text"),
        recipesFile.async("text"),
        salesLogFile.async("text"),
      ]);

      const parseOptions = { header: true, dynamicTyping: true, skipEmptyLines: true };

      const newMaterials = Papa.parse(materialsText, parseOptions).data;
      const newRecipesRaw = Papa.parse(recipesText, parseOptions).data;
      const newSalesLog = Papa.parse(salesLogText, parseOptions).data;
      
      // recipesのitemsをJSONパース
      const newRecipes = newRecipesRaw.map(r => ({
          ...r,
          items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items
      }));

      // Stateを更新
      setMaterials(newMaterials);
      setRecipes(newRecipes);
      setSalesLog(newSalesLog);

      // IDを更新
      setNextMaterialId(newMaterials.length > 0 ? Math.max(...newMaterials.map(m => m.id), 0) + 1 : 1);
      setNextRecipeId(newRecipes.length > 0 ? Math.max(...newRecipes.map(r => r.id), 0) + 1 : 1);
      setNextSaleId(newSalesLog.length > 0 ? Math.max(...newSalesLog.map(s => s.id), 0) + 1 : 1);
      
      alert('データのインポートが完了しました。');
      onClose(); // モーダルを閉じる

    } catch (error) {
      console.error("インポート中にエラーが発生しました:", error);
      alert(`インポートに失敗しました。\nエラー: ${error.message}`);
    } finally {
      e.target.value = null; // Reset file input
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>設定：データのインポートとエクスポート</h2>
        <button onClick={onClose} className="modal-close-button">×</button>

        <div className="setting-section">
          <h3>エクスポート</h3>
          <p>現在の全てのデータをバックアップファイルとしてダウンロードします。</p>
          <button onClick={handleExport} className="btn-primary">全データエクスポート</button>
        </div>

        <div className="setting-section">
          <h3>インポート</h3>
          <p className="danger">注意：インポートすると現在のデータは上書きされます。</p>
          <p>バックアップファイル（.zip）を選択して、データを復元します。</p>
          <input type="file" accept=".zip" onChange={handleImport} />
        </div>
      </div>
    </div>
  );
};