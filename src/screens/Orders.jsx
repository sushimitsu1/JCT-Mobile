import { useState, useEffect } from 'react'
import { collection, getDocs, doc, updateDoc, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import BarcodeScanner from '../components/BarcodeScanner'
import {
  ShoppingCart, ScanLine, CheckCircle, Clock,
  ChevronRight, ArrowLeft, Package, XCircle
} from 'lucide-react'

export default function Orders() {
  const [view, setView] = useState('list')        // 'list' | 'detail' | 'scanning'
  const [orders, setOrders] = useState([])
  const [selected, setSelected] = useState(null)
  const [scannedItems, setScannedItems] = useState({})  // skuId -> qty scanned
  const [scanError, setScanError] = useState('')
  const [scanSuccess, setScanSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadOrders() }, [])

  const loadOrders = async () => {
    setLoading(true)
    setError('')
    try {
      const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')))
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Only show orders that need picking
      setOrders(all.filter(o => o.status === 'pending' || o.status === 'picking'))
    } catch (e) {
      setError('Failed to load orders.')
    } finally {
      setLoading(false)
    }
  }

  const openOrder = (order) => {
    setSelected(order)
    setScannedItems({})
    setScanError('')
    setScanSuccess('')
    setView('detail')
  }

  const handleScan = (barcode) => {
    setScanError('')
    setScanSuccess('')

    // Find matching line item by sku, barcode, or upc
    const match = selected.items?.find(item =>
      item.sku === barcode ||
      item.skuId === barcode ||
      item.barcode === barcode ||
      item.upc === barcode
    )

    if (!match) {
      setScanError(`Barcode "${barcode}" doesn't match any item on this order.`)
      setView('detail')
      return
    }

    const key = match.skuId || match.sku
    const alreadyScanned = scannedItems[key] || 0
    const needed = match.quantity || match.qty || 0

    if (alreadyScanned >= needed) {
      setScanError(`${match.sku} already fully scanned (${needed}/${needed}).`)
      setView('detail')
      return
    }

    const newQty = alreadyScanned + 1
    setScannedItems(prev => ({ ...prev, [key]: newQty }))

    if (newQty >= needed) {
      setScanSuccess(`✓ ${match.sku} complete! (${newQty}/${needed})`)
    } else {
      setScanSuccess(`${match.sku}: ${newQty} of ${needed} scanned`)
    }
    setView('detail')
  }

  const allPicked = () => {
    if (!selected?.items?.length) return false
    return selected.items.every(item => {
      const key = item.skuId || item.sku
      const needed = item.quantity || item.qty || 0
      return (scannedItems[key] || 0) >= needed
    })
  }

  const confirmShip = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'orders', selected.id), {
        status: 'shipped',
        shippedDate: new Date().toISOString().split('T')[0]
      })
      // Remove from list
      setOrders(prev => prev.filter(o => o.id !== selected.id))
      setView('list')
      setSelected(null)
    } catch (e) {
      setScanError('Failed to update order. Check your connection.')
    } finally {
      setSaving(false)
    }
  }

  const markPicking = async (order) => {
    try {
      await updateDoc(doc(db, 'orders', order.id), { status: 'picking' })
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'picking' } : o))
      openOrder({ ...order, status: 'picking' })
    } catch (e) {
      openOrder(order)
    }
  }

  // ─── Scanner view ────────────────────────────────────────────────
  if (view === 'scanning') {
    return (
      <BarcodeScanner
        title="Scan Item"
        onScan={handleScan}
        onClose={() => setView('detail')}
      />
    )
  }

  // ─── Order detail / pick view ────────────────────────────────────
  if (view === 'detail' && selected) {
    const totalItems = selected.items?.length || 0
    const pickedItems = selected.items?.filter(item => {
      const key = item.skuId || item.sku
      return (scannedItems[key] || 0) >= (item.quantity || item.qty || 0)
    }).length || 0

    return (
      <div className="flex flex-col gap-4 pb-4">
        {/* Back + header */}
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="text-gray-400">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-800">
              {selected.orderNumber || selected.id}
            </h2>
            <p className="text-xs text-gray-400">{selected.clientName}</p>
          </div>
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
            selected.status === 'picking'
              ? 'bg-blue-100 text-blue-600'
              : 'bg-yellow-100 text-yellow-600'
          }`}>
            {selected.status}
          </span>
        </div>

        {/* Progress bar */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Pick progress</span>
            <span>{pickedItems} / {totalItems} items</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-jct-red rounded-full transition-all"
              style={{ width: totalItems ? `${(pickedItems / totalItems) * 100}%` : '0%' }}
            />
          </div>
        </div>

        {/* Feedback */}
        {scanSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
            <CheckCircle size={16} /> {scanSuccess}
          </div>
        )}
        {scanError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
            <XCircle size={16} /> {scanError}
          </div>
        )}

        {/* Item list */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {selected.items?.map((item, i) => {
            const key = item.skuId || item.sku
            const needed = item.quantity || item.qty || 0
            const scanned = scannedItems[key] || 0
            const done = scanned >= needed
            return (
              <div key={i}
                className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${
                  done ? 'bg-green-50' : ''
                }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  done ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  {done
                    ? <CheckCircle size={16} className="text-green-600" />
                    : <Package size={16} className="text-gray-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{item.sku}</p>
                  <p className="text-xs text-gray-400 truncate">{item.description}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-sm font-bold ${done ? 'text-green-600' : 'text-gray-800'}`}>
                    {scanned}/{needed}
                  </span>
                  <p className="text-xs text-gray-400">units</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Action buttons */}
        <button
          onClick={() => { setScanError(''); setScanSuccess(''); setView('scanning') }}
          className="w-full bg-jct-red text-white py-3.5 rounded-xl font-semibold text-base flex items-center justify-center gap-2">
          <ScanLine size={20} /> Scan Item
        </button>

        {allPicked() && (
          <button
            onClick={confirmShip}
            disabled={saving}
            className="w-full bg-green-600 text-white py-3.5 rounded-xl font-semibold text-base disabled:opacity-50">
            {saving ? 'Saving...' : '✓ Confirm Shipped'}
          </button>
        )}
      </div>
    )
  }

  // ─── Order list ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart size={20} className="text-jct-navy" />
          <h2 className="text-base font-bold text-gray-800">Orders to Pick</h2>
        </div>
        <button onClick={loadOrders} className="text-xs text-jct-blue font-medium">
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
          Loading...
        </div>
      )}

      {!loading && orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <CheckCircle size={40} className="text-green-400" />
          <p className="text-gray-500 font-medium">All caught up!</p>
          <p className="text-gray-400 text-sm">No pending orders to pick</p>
        </div>
      )}

      {orders.map(order => {
        const totalItems = order.items?.length || 0
        return (
          <button key={order.id} onClick={() => markPicking(order)}
            className="w-full bg-white rounded-xl shadow-sm p-4 flex items-center gap-3 text-left">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              order.status === 'picking' ? 'bg-blue-100' : 'bg-yellow-100'
            }`}>
              {order.status === 'picking'
                ? <ShoppingCart size={18} className="text-blue-600" />
                : <Clock size={18} className="text-yellow-600" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">
                {order.orderNumber || order.id}
              </p>
              <p className="text-xs text-gray-400 truncate">{order.clientName}</p>
              <p className="text-xs text-gray-400">{totalItems} item{totalItems !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                order.status === 'picking'
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-yellow-100 text-yellow-600'
              }`}>
                {order.status}
              </span>
              <ChevronRight size={16} className="text-gray-300" />
            </div>
          </button>
        )
      })}
    </div>
  )
}