import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { ShoppingCart, Plus, Trash2, Bell, TrendingDown, ExternalLink, List, LogOut, RefreshCw } from 'lucide-react';
import { triggerBackendPriceSearch } from './backendPriceService';
import { syncSessionWithExtension } from './extensionAuthService';

// Debug Panel Component - Shows detailed matching information per retailer
function DebugPanel({ itemId, loadDebugInfo, compareStatus, compareError, compareStartedAt, compareFinishedAt }) {
  const [debugData, setDebugData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const snapshots = await loadDebugInfo(itemId);
      setDebugData(snapshots);
      setLoading(false);
    };
    loadData();
  }, [itemId, loadDebugInfo]);

  if (loading) {
    return <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">Loading debug info...</div>;
  }

  if (debugData.length === 0) {
    return <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">No debug data available</div>;
  }

  return (
    <div className="mt-4 border-2 border-yellow-400 rounded-lg bg-yellow-50 p-4">
      <div className="text-sm font-bold text-yellow-900 mb-3">🐛 Debug Information</div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-4 p-2 bg-white border border-yellow-200 rounded">
        <div>
          <span className="font-semibold text-gray-700">Compare Status:</span>{' '}
          <span className="uppercase tracking-wide font-bold text-yellow-900">{compareStatus || 'pending'}</span>
        </div>
        <div>
          <span className="font-semibold text-gray-700">Started:</span>{' '}
          <span className="text-gray-800">{compareStartedAt ? new Date(compareStartedAt).toLocaleString() : '—'}</span>
        </div>
        <div>
          <span className="font-semibold text-gray-700">Finished:</span>{' '}
          <span className="text-gray-800">{compareFinishedAt ? new Date(compareFinishedAt).toLocaleString() : '—'}</span>
        </div>
        {compareError && (
          <div className="col-span-2 text-red-700 font-semibold">
            Error: {compareError}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {debugData.map((snapshot, idx) => (
          <div key={idx} className="bg-white border-l-4 border-yellow-400 p-3 rounded">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2 flex items-center gap-2">
                <div className="font-bold text-yellow-900 capitalize mb-2">{snapshot.retailer.toUpperCase()}</div>
                {snapshot.is_match_attempt && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 bg-yellow-200 text-yellow-900 rounded">Attempt</span>
                )}
              </div>

              {/* Matched URL */}
              {snapshot.url && (
                <div className="col-span-2">
                  <div className="text-gray-600 font-semibold">URL:</div>
                  <a href={snapshot.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 break-all hover:underline">
                    {snapshot.url.substring(0, 60)}...
                  </a>
                </div>
              )}

              {/* Matched Title */}
              {snapshot.product_title && (
                <div className="col-span-2">
                  <div className="text-gray-600 font-semibold">Title:</div>
                  <div className="text-gray-800 break-words">{snapshot.product_title}</div>
                </div>
              )}

              {/* Match Confidence */}
              <div className="col-span-2">
                <div className="text-gray-600 font-semibold">Confidence:</div>
                <div className="text-gray-800">
                  {snapshot.match_confidence !== null && snapshot.match_confidence !== undefined
                    ? `${(snapshot.match_confidence * 100).toFixed(0)}% ${snapshot.match_confidence >= 0.75 ? '✅' : '⚠️'}`
                    : 'N/A'}
                </div>
              </div>

              {/* Matching Reason */}
              {snapshot.matching_reason && (
                <div className="col-span-2">
                  <div className="text-gray-600 font-semibold">Reason:</div>
                  <div className="text-gray-800">{snapshot.matching_reason}</div>
                </div>
              )}

              {/* Extracted Attributes */}
              <div className="col-span-2 border-t pt-2">
                <div className="font-semibold text-gray-700 mb-1">Extracted Attributes:</div>
                <div className="grid grid-cols-2 gap-2 text-gray-700">
                  {snapshot.extracted_brand && (
                    <div><span className="font-semibold">Brand:</span> {snapshot.extracted_brand}</div>
                  )}
                  {snapshot.extracted_pack_size && (
                    <div><span className="font-semibold">Pack Size:</span> {snapshot.extracted_pack_size}</div>
                  )}
                  {snapshot.extracted_model && (
                    <div><span className="font-semibold">Model:</span> {snapshot.extracted_model}</div>
                  )}
                  {snapshot.extracted_upc && (
                    <div><span className="font-semibold">UPC:</span> {snapshot.extracted_upc}</div>
                  )}
                  {snapshot.extracted_variants && (
                    <div className="col-span-2">
                      <span className="font-semibold">Variants:</span> {snapshot.extracted_variants}
                    </div>
                  )}
                </div>
              </div>

              {/* Product ID */}
              {snapshot.product_id && (
                <div className="col-span-2">
                  <span className="font-semibold text-gray-600">Product ID:</span> <span className="font-mono text-gray-800">{snapshot.product_id}</span>
                </div>
              )}

              {/* Match Method */}
              {snapshot.match_method && (
                <div className="col-span-2">
                  <span className="font-semibold text-gray-600">Match Method:</span> <span className="text-gray-800 capitalize">{snapshot.match_method}</span>
                </div>
              )}

              {/* Matched Image */}
              {snapshot.image_url && (
                <div className="col-span-2">
                  <div className="text-gray-600 font-semibold mb-1">Image:</div>
                  <img 
                    src={snapshot.image_url} 
                    alt="matched" 
                    className="w-20 h-20 rounded object-cover border border-gray-300"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                </div>
              )}

              {/* Price */}
              <div>
                <span className="font-semibold text-gray-600">Price:</span>{' '}
                <span className="text-gray-800">{snapshot.price !== null && snapshot.price !== undefined ? `$${snapshot.price}` : '—'}</span>
              </div>

              {/* Last Updated */}
              <div>
                <span className="font-semibold text-gray-600">Updated:</span>{' '}
                <span className="text-gray-800">{snapshot.checked_at ? new Date(snapshot.checked_at).toLocaleString() : '—'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Manual Override Modal Component
function ManualOverrideModal({ itemId, retailer, snapshot, onClose, onSelect, onRemove }) {
  const [customUrl, setCustomUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-800">Fix Incorrect Match - {retailer.toUpperCase()}</h3>
          <p className="text-sm text-gray-600 mt-1">Current product: {snapshot?.product_title}</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Remove Option */}
          <div className="border-b pb-4">
            <button
              onClick={() => {
                if (confirm('Remove this retailer offer?')) {
                  onRemove(snapshot?.snapshot_id ?? snapshot?.id, snapshot?.source);
                  onClose();
                }
              }}
              className="w-full px-4 py-3 bg-red-50 border-2 border-red-200 rounded-lg hover:bg-red-100 text-red-700 font-semibold"
            >
              ✗ Remove This Offer
            </button>
            <p className="text-xs text-gray-600 mt-2">This offer will be deleted and you won't see {retailer} prices for this item.</p>
          </div>

          {/* Manual URL Entry */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-2">Search for Correct Product</h4>
            <p className="text-sm text-gray-600 mb-3">
              Visit {retailer} website, find the correct product, and paste the link below:
            </p>
            
            {!showUrlInput ? (
              <button
                onClick={() => setShowUrlInput(true)}
                className="w-full px-4 py-3 bg-indigo-50 border-2 border-indigo-200 rounded-lg hover:bg-indigo-100 text-indigo-700 font-semibold"
              >
                + Paste Product URL
              </button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Product URL:</label>
                  <input
                    type="url"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder={`https://${retailer.toLowerCase()}.com/...`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Product Title (optional):</label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Product name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (!customUrl.trim()) {
                        alert('Please enter a URL');
                        return;
                      }
                      onSelect({ url: customUrl }, customUrl, customTitle || snapshot?.product_title);
                    }}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold"
                  >
                    ✓ Use This Product
                  </button>
                  <button
                    onClick={() => setShowUrlInput(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mt-4">
            <p className="text-sm text-blue-900">
              💡 <strong>Tip:</strong> Make sure the new product has the same pack size, brand, and variant (e.g., scent) as your original item.
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [items, setItems] = useState([]);
  const [itemsPage, setItemsPage] = useState(1);
  const [itemsPageSize] = useState(20);
  const [itemsTotal, setItemsTotal] = useState(0);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddList, setShowAddList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newItem, setNewItem] = useState({ name: '', url: '', notes: '' });
  const [newItemUrlStatus, setNewItemUrlStatus] = useState({ ok: true, message: '', retailer: null });
  const [checkingPrices, setCheckingPrices] = useState(false);
  const [toast, setToast] = useState(null);
  const [showExtensionHint, setShowExtensionHint] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [selectedItemDebug, setSelectedItemDebug] = useState(null);
  const [overrideModal, setOverrideModal] = useState(null); // { itemId, retailer, currentSnapshot }
  const [overrideSearch, setOverrideSearch] = useState('');
  const [overrideSearchResults, setOverrideSearchResults] = useState([]);
  const [overrideLoading, setOverrideLoading] = useState(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState('signin');

  const getRetailerFromUrl = (url) => {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.includes('amazon.') || lower.includes('amzn.to')) return 'amazon';
    if (lower.includes('walmart.')) return 'walmart';
    if (lower.includes('target.')) return 'target';
    return null;
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      // Send session to extension on initial load
      syncSessionWithExtension(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // Sync session changes with extension
      syncSessionWithExtension(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      loadLists();
    }
  }, [session]);

  useEffect(() => {
    if (selectedList) {
      setItemsPage(1);
    }
  }, [selectedList]);

  useEffect(() => {
    if (selectedList) {
      loadItems(selectedList, itemsPage);
    }
  }, [selectedList, itemsPage]);

  const loadLists = async () => {
    const { data, error } = await supabase
      .from('shopping_lists')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error loading lists:', error);
    } else {
      setLists(data || []);
      if (data && data.length > 0 && !selectedList) {
        setSelectedList(data[0].id);
      }
    }
  };

  const loadItems = async (listId, page = 1) => {
    setItemsLoading(true);
    const offset = (page - 1) * itemsPageSize;
    const { data, error } = await supabase
      .rpc('get_list_items_with_latest_prices', {
        p_list_id: listId,
        p_limit: itemsPageSize,
        p_offset: offset
      });
    
    if (error) {
      console.error('Error loading items:', error);
      setItemsLoading(false);
      return;
    }

    const itemsWithPrices = (data || []).map((item) => ({
      ...item,
      prices: item.prices || {},
      latestByRetailer: item.latest_by_retailer || {},
      priceSnapshots: [],
      offers: []
    }));

    if (page === 1) {
      setItems(itemsWithPrices);
      const { count } = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('list_id', listId);
      setItemsTotal(count || 0);
    } else {
      setItems((prev) => [...prev, ...itemsWithPrices]);
    }

    setItemsLoading(false);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (authMode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        showToast('Error signing up: ' + error.message, 'error');
      } else {
        showToast('Check your email for confirmation link!', 'success');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        showToast('Error signing in: ' + error.message, 'error');
      }
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setLists([]);
    setItems([]);
    setSelectedList(null);
  };

  const addList = async () => {
    if (!newListName.trim()) return;
    
    const { data, error } = await supabase
      .from('shopping_lists')
      .insert([{ name: newListName, user_id: session.user.id }])
      .select();
    
    if (error) {
      showToast('Error creating list: ' + error.message, 'error');
    } else {
      await loadLists();
      setNewListName('');
      setShowAddList(false);
      showToast('List created', 'success');
    }
  };

  const deleteList = async (listId) => {
    if (lists.length <= 1) {
      showToast('Keep at least one list', 'error');
      return;
    }
    
    const { error } = await supabase
      .from('shopping_lists')
      .delete()
      .eq('id', listId);
    
    if (error) {
      showToast('Error deleting list: ' + error.message, 'error');
    } else {
      await loadLists();
      if (selectedList === listId) {
        setSelectedList(lists[0].id);
      }
      showToast('List deleted', 'success');
    }
  };

  const deriveNameFromUrl = (url) => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const lastPart = pathParts[pathParts.length - 1] || '';
      const cleaned = lastPart
        .replace(/[-_]+/g, ' ')
        .replace(/\.(html|htm|php|asp|aspx)$/i, '')
        .trim();
      if (cleaned) {
        return `${host}: ${cleaned}`;
      }
      return `Item from ${host}`;
    } catch {
      return 'Item from URL';
    }
  };

  const validateRetailerUrl = (url) => {
    const trimmed = url.trim();
    if (!trimmed) {
      return { ok: true, message: '', retailer: null };
    }

    try {
      const parsed = new URL(trimmed);
      if (!parsed.hostname) {
        return { ok: false, message: 'Enter a valid URL from Target, Walmart, or Amazon.', retailer: null };
      }
    } catch {
      return { ok: false, message: 'Enter a valid URL from Target, Walmart, or Amazon.', retailer: null };
    }

    const retailer = getRetailerFromUrl(trimmed);
    if (!retailer) {
      return {
        ok: false,
        message: 'This app only tracks Target, Walmart, and Amazon links. Paste a supported product URL or leave it blank.',
        retailer: null
      };
    }

    return { ok: true, message: '', retailer };
  };

  const handlePasteIntoNewItem = (field) => (e) => {
    const text = e.clipboardData?.getData('text');
    if (!text) return;
    e.preventDefault();
    setNewItem((prev) => {
      const next = { ...prev, [field]: text };
      if (field === 'url' && !prev.name.trim()) {
        next.name = deriveNameFromUrl(text);
      }
      return next;
    });
    if (field === 'url') {
      setNewItemUrlStatus(validateRetailerUrl(text));
    }
  };

  const pasteFromClipboard = async (field) => {
    if (!navigator.clipboard?.readText) {
      showToast('Clipboard API not available in this browser.', 'error');
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        showToast('Clipboard is empty.', 'error');
        return;
      }
      setNewItem((prev) => {
        const next = { ...prev, [field]: text };
        if (field === 'url' && !prev.name.trim()) {
          next.name = deriveNameFromUrl(text);
        }
        return next;
      });
      if (field === 'url') {
        setNewItemUrlStatus(validateRetailerUrl(text));
      }
    } catch {
      showToast('Clipboard access blocked. Try right-click paste.', 'error');
    }
  };

  const addItem = async () => {
    const trimmedName = newItem.name.trim();
    const trimmedUrl = newItem.url.trim();
    if (!trimmedName && !trimmedUrl) {
      showToast('Please enter a product name or paste a URL.', 'error');
      return;
    }
    if (trimmedUrl && !newItemUrlStatus.ok) {
      showToast('Please use a valid Target, Walmart, or Amazon URL.', 'error');
      return;
    }
    const finalName = trimmedName || deriveNameFromUrl(trimmedUrl);
    
    const { data, error } = await supabase
      .from('items')
      .insert([{
        list_id: selectedList,
        name: finalName,
        url: trimmedUrl || null,
        notes: newItem.notes || null,
        compare_status: 'running',
        compare_started_at: new Date().toISOString(),
        compare_finished_at: null,
        compare_last_error: null
      }])
      .select();
    
    if (error) {
      showToast('Error adding item: ' + error.message, 'error');
      return;
    }

    const itemId = data[0].id;
    const productName = finalName;

    // Clear form immediately - item is saved
    setNewItem({ name: '', url: '', notes: '' });
    setNewItemUrlStatus({ ok: true, message: '', retailer: null });
    setShowAddItem(false);
    
    // Reload to show new item with "Searching..." status
    setItemsPage(1);
    await loadItems(selectedList, 1);
    showToast('Item added! Searching for prices...', 'success');

    // Trigger async backend price search (non-blocking, no extension required)
    triggerBackendPriceSearch(itemId, productName, supabase, session)
      .catch((error) => {
        console.error('Error triggering price search:', error);
      });
  };

  const deleteItem = async (itemId) => {
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', itemId);
    
    if (error) {
      showToast('Error deleting item: ' + error.message, 'error');
    } else {
      setItemsPage(1);
      await loadItems(selectedList, 1);
      showToast('Item deleted', 'success');
    }
  };

  const refreshPrices = async (itemId, itemName) => {
    console.log("refreshPrices() running");
    console.log("About to call triggerBackendPriceSearch", { itemId, productName: itemName });
    
    showToast('Searching for prices...', 'success');
    
    // Trigger async backend search
    triggerBackendPriceSearch(itemId, itemName, supabase, session)
      .catch((error) => {
        console.error('Error refreshing prices:', error);
        showToast('Error updating prices.', 'error');
      });
  };

  const getBestPrice = (prices) => {
    if (!prices || Object.keys(prices).length === 0) return ['N/A', 0];
    const entries = Object.entries(prices);
    return entries.reduce((best, current) => 
      parseFloat(current[1]) < parseFloat(best[1]) ? current : best
    );
  };

  const loadDebugInfo = async (itemId) => {
    const { data: offers } = await supabase
      .from('offers')
      .select('*')
      .eq('item_id', itemId)
      .order('checked_at', { ascending: false });

    if (offers && offers.length > 0) {
      return offers;
    }

    const { data: priceSnapshots } = await supabase
      .from('price_snapshots')
      .select('*')
      .eq('item_id', itemId)
      .order('checked_at', { ascending: false });
    
    return priceSnapshots || [];
  };

  const removeRetailerOffer = async (snapshotId, source) => {
    const table = source === 'offers' ? 'offers' : 'price_snapshots';
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', snapshotId);
    
    if (error) {
      showToast('Error removing offer: ' + error.message, 'error');
    } else {
      setItemsPage(1);
      await loadItems(selectedList, 1);
      showToast('Offer removed', 'success');
    }
  };

  const openManualOverride = (itemId, retailer, snapshot) => {
    setOverrideModal({ itemId, retailer, currentSnapshot: snapshot });
    setOverrideSearch('');
    setOverrideSearchResults([]);
  };

  const closeManualOverride = () => {
    setOverrideModal(null);
    setOverrideSearch('');
    setOverrideSearchResults([]);
  };

  const searchAlternativeProducts = async (query) => {
    if (!query.trim()) {
      setOverrideSearchResults([]);
      return;
    }

    setOverrideLoading(true);
    try {
      // Simulate searching the retailer's site (in production, this would call an API)
      // For now, we'll just show a message that they should copy/paste the URL
      setOverrideSearchResults([
        { 
          id: 'manual_entry',
          title: `Search: "${query}" on ${overrideModal.retailer}`,
          url: `Manual entry - paste URL below`,
          isManualEntry: true
        }
      ]);
    } catch (error) {
      showToast('Error searching products: ' + error.message, 'error');
    } finally {
      setOverrideLoading(false);
    }
  };

  const selectAlternativeProduct = async (selectedProduct, customUrl, customTitle) => {
    if (!overrideModal) return;

    const newUrl = customUrl || selectedProduct.url;
    const newTitle = customTitle || selectedProduct.title;

    if (!newUrl) {
      showToast('Please provide a URL', 'error');
      return;
    }

    try {
      const snapshotSource = overrideModal.currentSnapshot?.source;
      const snapshotId = overrideModal.currentSnapshot?.snapshot_id ?? overrideModal.currentSnapshot?.id;
      const isPriceSnapshot = snapshotSource
        ? snapshotSource === 'price_snapshots'
        : overrideModal.currentSnapshot?.match_method !== undefined
          || overrideModal.currentSnapshot?.is_manual_override !== undefined
          || overrideModal.currentSnapshot?.product_id !== undefined;

      if (isPriceSnapshot) {
        // Update the price snapshot with manual override
        const { error } = await supabase
          .from('price_snapshots')
          .update({
            url: newUrl,
            product_title: newTitle,
            is_manual_override: true,
            manual_override_reason: `User manually selected ${overrideModal.retailer} product`
          })
          .eq('id', snapshotId);

        if (error) throw error;
      } else {
        // Snapshot came from offers; store the URL there so UI can link immediately
        const { error } = await supabase
          .from('offers')
          .update({
            url: newUrl,
            product_title: newTitle,
            is_match_attempt: false,
            checked_at: new Date().toISOString(),
          })
          .eq('id', snapshotId);

        if (error) throw error;
      }

      // Persist the chosen retailer URL for future direct fetches
      const currentItem = items.find((item) => item.id === overrideModal.itemId);
      const existingRetailerUrls = currentItem?.retailer_urls || {};
      const updatedRetailerUrls = { ...existingRetailerUrls, [overrideModal.retailer]: newUrl };
      const currentItemUrl = currentItem?.url || null;
      const currentUrlRetailer = getRetailerFromUrl(currentItemUrl);
      const shouldUpdateItemUrl = !currentItemUrl || currentUrlRetailer === overrideModal.retailer;

      const { error: itemUpdateError } = await supabase
        .from('items')
        .update({
          retailer_urls: updatedRetailerUrls,
          ...(shouldUpdateItemUrl ? { url: newUrl } : {}),
        })
        .eq('id', overrideModal.itemId);

      if (itemUpdateError) throw itemUpdateError;

      setItemsPage(1);
      await loadItems(selectedList, 1);
      showToast('Product match updated', 'success');
      closeManualOverride();
      const itemForRefresh = items.find((item) => item.id === overrideModal.itemId);
      const refreshName = itemForRefresh?.name || newTitle || overrideModal.currentSnapshot?.product_title || '';
      refreshPrices(overrideModal.itemId, refreshName);
    } catch (error) {
      showToast('Error updating product: ' + error.message, 'error');
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="flex items-center gap-3 mb-6 justify-center">
            <ShoppingCart className="text-indigo-600" size={40} />
            <h1 className="text-3xl font-bold text-gray-800">Price Tracker</h1>
          </div>
          
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400"
            >
              {loading ? 'Loading...' : (authMode === 'signin' ? 'Sign In' : 'Sign Up')}
            </button>
          </form>
          
          <div className="mt-4 text-center">
            <button
              onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
              className="text-indigo-600 hover:underline"
            >
              {authMode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentList = lists.find(l => l.id === selectedList);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="max-w-6xl mx-auto p-4">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="text-indigo-600" size={32} />
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Smart Shopping Tracker</h1>
                <p className="text-gray-600">Signed in as {session.user.email}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <LogOut size={20} />
              Sign Out
            </button>
            <button
              onClick={() => setDebugMode(!debugMode)}
              className={`ml-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                debugMode
                  ? 'bg-yellow-200 text-yellow-900 hover:bg-yellow-300'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              title="Toggle debug view"
            >
              {debugMode ? '🐛 Debug: ON' : '🐛 Debug: OFF'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <List size={20} />
                  My Lists
                </h2>
                <button
                  onClick={() => setShowAddList(true)}
                  className="text-indigo-600 hover:text-indigo-700"
                >
                  <Plus size={20} />
                </button>
              </div>

              {showAddList && (
                <div className="mb-3 p-3 bg-gray-50 rounded">
                  <input
                    type="text"
                    placeholder="List name..."
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addList()}
                    className="w-full px-3 py-2 border rounded mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={addList}
                      className="flex-1 bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setShowAddList(false)}
                      className="flex-1 bg-gray-300 px-3 py-1 rounded text-sm hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {lists.map(list => (
                  <div
                    key={list.id}
                    className={`p-3 rounded cursor-pointer flex items-center justify-between group ${
                      selectedList === list.id 
                        ? 'bg-indigo-100 border-2 border-indigo-400' 
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div onClick={() => setSelectedList(list.id)} className="flex-1">
                      <div className="font-medium text-gray-800">{list.name}</div>
                      <div className="text-sm text-gray-500">
                        {items.filter(i => i.list_id === list.id).length} items
                      </div>
                    </div>
                    {lists.length > 1 && (
                      <button
                        onClick={() => deleteList(list.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">{currentList?.name}</h2>
                <button
                  onClick={() => setShowAddItem(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700"
                >
                  <Plus size={20} />
                  Add Item
                </button>
              </div>

              {showAddItem && (
                <div className="mb-6 p-4 bg-indigo-50 rounded-lg border-2 border-indigo-200">
                  <h3 className="font-semibold mb-3">Add New Item</h3>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Product name"
                      value={newItem.name}
                      onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                      onPaste={handlePasteIntoNewItem('name')}
                      className="w-full px-3 py-2 border rounded"
                    />
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="Product URL (optional)"
                        value={newItem.url}
                        onChange={(e) => {
                          const value = e.target.value;
                          setNewItem({ ...newItem, url: value });
                          setNewItemUrlStatus(validateRetailerUrl(value));
                        }}
                        onPaste={handlePasteIntoNewItem('url')}
                        className="flex-1 px-3 py-2 border rounded"
                      />
                      <button
                        type="button"
                        onClick={() => pasteFromClipboard('url')}
                        className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        title="Paste from clipboard"
                      >
                        Paste
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      <span className="font-semibold text-gray-700">Supported retailers:</span>
                      <span className="px-2 py-1 rounded-full bg-white border border-gray-200">Amazon</span>
                      <span className="px-2 py-1 rounded-full bg-white border border-gray-200">Walmart</span>
                      <span className="px-2 py-1 rounded-full bg-white border border-gray-200">Target</span>
                      {newItemUrlStatus.retailer && (
                        <span className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                          Detected: {newItemUrlStatus.retailer}
                        </span>
                      )}
                    </div>
                    {!newItemUrlStatus.ok && (
                      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                        {newItemUrlStatus.message}
                      </div>
                    )}
                    <textarea
                      placeholder="Notes (optional)"
                      value={newItem.notes}
                      onChange={(e) => setNewItem({...newItem, notes: e.target.value})}
                      onPaste={handlePasteIntoNewItem('notes')}
                      className="w-full px-3 py-2 border rounded"
                      rows="2"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={addItem}
                        disabled={(!newItem.name.trim() && !newItem.url.trim()) || !newItemUrlStatus.ok}
                        className={`flex-1 px-4 py-2 rounded text-white ${
                          (newItem.name.trim() || newItem.url.trim()) && newItemUrlStatus.ok
                            ? 'bg-indigo-600 hover:bg-indigo-700'
                            : 'bg-gray-400 cursor-not-allowed'
                        }`}
                      >
                        Add to List
                      </button>
                      <button
                        onClick={() => setShowAddItem(false)}
                        className="flex-1 bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {items.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <ShoppingCart size={48} className="mx-auto mb-3 opacity-50" />
                  <p>No items yet. Add your first item to start tracking prices!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map(item => {
                    const [bestRetailer, bestPrice] = getBestPrice(item.prices);
                    const retailerUrls = item.retailer_urls || {};
                    const compareStatus = item.compare_status || 'pending';
                    const compareBadge = {
                      running: { text: 'Running', className: 'bg-yellow-100 text-yellow-800' },
                      done: { text: 'Done', className: 'bg-green-100 text-green-800' },
                      failed: { text: 'Failed', className: 'bg-red-100 text-red-800' },
                      pending: { text: 'Pending', className: 'bg-gray-100 text-gray-800' }
                    }[compareStatus] || { text: compareStatus, className: 'bg-gray-100 text-gray-800' };
                    
                    return (
                      <div key={item.id} className="border rounded-lg p-4 hover:shadow-lg transition-shadow flex gap-4">
                        {/* Product Image Thumbnail */}
                        <div className="flex-shrink-0">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-16 h-16 rounded object-cover bg-gray-100"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextElementSibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div
                            className="w-16 h-16 rounded bg-gray-200 flex items-center justify-center text-gray-400 flex-col gap-1"
                            style={{ display: item.image_url ? 'none' : 'flex' }}
                          >
                            <ShoppingCart size={24} />
                            <span className="text-xs text-center">No image</span>
                          </div>
                        </div>

                        {/* Item Details */}
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold text-gray-800 mb-1">{item.name}</h3>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs font-semibold px-2 py-1 rounded ${compareBadge.className}`}>
                                  Compare: {compareBadge.text}
                                </span>
                                {item.compare_last_error && (
                                  <span className="text-xs text-red-600">{item.compare_last_error}</span>
                                )}
                              </div>
                              {item.notes && <p className="text-sm text-gray-600 mb-2">{item.notes}</p>}
                              {item.url && (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-600 text-sm flex items-center gap-1 hover:underline"
                                >
                                  View original listing <ExternalLink size={14} />
                                </a>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  console.log("REFRESH CLICKED", { itemId: item.id, productName: item.name });
                                  refreshPrices(item.id, item.name);
                                }}
                                className="text-blue-500 hover:text-blue-700"
                                title="Search for prices across retailers"
                              >
                                <RefreshCw size={20} />
                              </button>
                              {debugMode && (
                                <button
                                  onClick={() => setSelectedItemDebug(selectedItemDebug === item.id ? null : item.id)}
                                  className="text-yellow-600 hover:text-yellow-800 font-bold"
                                  title="Show debug info"
                                >
                                  🐛
                                </button>
                              )}
                              <button
                                onClick={() => deleteItem(item.id)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 size={20} />
                              </button>
                            </div>
                          </div>

                          {Object.keys(item.prices).length > 0 ? (
                          <>
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 flex items-center gap-2">
                              <TrendingDown className="text-green-600" size={20} />
                              <div>
                                <div className="font-semibold text-green-800">
                                  Best Price: ${bestPrice} at {bestRetailer.charAt(0).toUpperCase() + bestRetailer.slice(1)}
                                </div>
                                <div className="text-sm text-green-700">
                                  Price tracked across {Object.keys(item.prices).length} retailers
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                              {Object.entries(item.prices).map(([retailer, price]) => {
                                // Latest snapshot for this retailer (from RPC)
                                const snapshot = item.latestByRetailer?.[retailer];
                                const retailerLink = retailerUrls[retailer] || snapshot?.url;
                                const fallbackSearchUrl = `https://www.${retailer}.com/s?k=${encodeURIComponent(item.name)}`;
                                const tileLink = retailerLink || fallbackSearchUrl;
                                
                                return (
                                  <a
                                    key={retailer}
                                    href={tileLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`block p-3 rounded border-2 relative ${
                                      retailer === bestRetailer 
                                        ? 'bg-green-50 border-green-400' 
                                        : 'bg-gray-50 border-gray-200'
                                    } hover:shadow-md transition-shadow`}
                                    title={`View on ${retailer}`}
                                  >
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="text-sm font-medium text-gray-600 capitalize">
                                        {retailer}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        {retailerLink && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              window.open(retailerLink, '_blank', 'noopener,noreferrer');
                                            }}
                                            className="text-indigo-600 hover:text-indigo-800"
                                            title={`View on ${retailer}`}
                                          >
                                            <ExternalLink size={14} />
                                          </button>
                                        )}
                                        {snapshot && (
                                          <button
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              openManualOverride(item.id, retailer, snapshot);
                                            }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            className="text-red-600 hover:text-red-800 text-xs font-semibold px-1 py-0.5 rounded hover:bg-red-100"
                                            title="This match is wrong - choose a different product"
                                          >
                                            ✗
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-xl font-bold text-gray-800">
                                      ${price}
                                    </div>
                                    {retailer === bestRetailer && (
                                      <div className="text-xs text-green-600 font-semibold mt-1">
                                        LOWEST
                                      </div>
                                    )}
                                    {snapshot?.is_manual_override && (
                                      <div className="text-xs text-orange-600 font-semibold mt-1">
                                        ✓ Manual Override
                                      </div>
                                    )}
                                  </a>
                                );
                              })}
                            </div>

                            {debugMode && selectedItemDebug === item.id && (
                              <DebugPanel
                                itemId={item.id}
                                loadDebugInfo={loadDebugInfo}
                                compareStatus={item.compare_status}
                                compareError={item.compare_last_error}
                                compareStartedAt={item.compare_started_at}
                                compareFinishedAt={item.compare_finished_at}
                              />
                            )}

                            <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                              <Bell size={16} />
                              <span>Extension will notify you when prices drop</span>
                            </div>
                          </>
                        ) : (
                          <div className="text-center py-4 text-gray-500">
                            {compareStatus === 'running' ? (
                              <div className="space-y-2">
                                <p className="font-semibold text-gray-700">Checking Walmart, Target, Amazon...</p>
                                <p className="text-sm text-gray-600">We'll show offers here as soon as they arrive.</p>
                              </div>
                            ) : (
                              <>
                                <p className="mb-2">No prices yet</p>
                                <button
                                  onClick={() => {
                                    console.log("REFRESH CLICKED", { itemId: item.id, productName: item.name });
                                    refreshPrices(item.id, item.name);
                                  }}
                                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 mx-auto"
                                >
                                  <RefreshCw size={16} />
                                  Search for Prices
                                </button>
                              </>
                            )}
                          </div>
                        )}                        </div>                      </div>
                    );
                  })}
                  {items.length < itemsTotal && (
                    <div className="flex justify-center pt-2">
                      <button
                        onClick={() => setItemsPage((page) => page + 1)}
                        disabled={itemsLoading}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                          itemsLoading
                            ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                      >
                        {itemsLoading
                          ? 'Loading...'
                          : `Load more (${items.length}/${itemsTotal})`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50">
          {toast.type === 'success' && <span>✓</span>}
          {toast.type === 'error' && <span>✗</span>}
          <span>{toast.message}</span>
        </div>
      )}
      
      {/* Optional Extension Helper Hint */}
      {showExtensionHint && (
        <div className="fixed bottom-16 right-4 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg shadow-md flex items-center gap-2 z-40 max-w-xs">
          <span className="text-sm">💡 Install the extension for faster price detection</span>
          <button
            onClick={() => setShowExtensionHint(false)}
            className="text-blue-400 hover:text-blue-600 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Manual Override Modal */}
      {overrideModal && (
        <ManualOverrideModal
          itemId={overrideModal.itemId}
          retailer={overrideModal.retailer}
          snapshot={overrideModal.currentSnapshot}
          onClose={closeManualOverride}
          onSelect={selectAlternativeProduct}
          onRemove={removeRetailerOffer}
        />
      )}
    </div>
  );
}

export default App;
