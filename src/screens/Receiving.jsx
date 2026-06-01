import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import BarcodeScanner from '../components/BarcodeScanner'
import { PackagePlus, ScanLine, Search, Plus, Minus, CheckCircle, ChevronDown, X } from 'lucide-react'

export default function Receiving() {
  const [step, setStep] = useState('form')       // 'form' | 'scanning' | 'confirm'
  const [clients, setClients] = useState([])
  const [skus, setSkus] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [clientId, setClientId] = useState('')
  const [clientName, setClientName] = useState('')
  const [refNumber, setRefNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([])

  const [scanTarget, setScanTarget] = useState(null)  // index of line being scanned, or 'new'
  const [manualSku, setManualSku] = useState('')
  const [showSkuPicker, setShowSkuPicker] = useState(false)
  const [skuSearch, setSkuSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [cSnap, sSnap] = await Promise.all([
          getDocs(collection(db, 'clients')),
          getDocs(collection(db, 'items'))
        ])
        setClients(cSnap.docs.map(d => ({ id: d.id, ...d.data() })))
        setSkus(sSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch (e) {
        setError('Failed to load data from Firebase.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleClientChange = (id) => {
    const c = clients.find(c => c.id === id)
    setClientId(id)
    setClientName(c?.name || c?.companyName || '')
  }

  const addLineFromSku = (sku) => {
    const existing = lines.findIndex(l => l.skuId === sku.id)
    if (existing >= 0) {
      const updated = [...lines]
      updated[existing].qty += 1
      setLines(updated)
    } else {
      setLines(prev => [...prev, {
        skuId: sku.id,
        sku: sku.sku || sku.id,
        description: sku.description || sku.name || '',
        qty: 1,
        pallets: 1,
        condition: 'A',
        location: ''
      }])
    }
    setShowSkuPicker(false)
    setSkuSearch('')
  }

  const handleScan = (barcode) => {
    const match = skus.find(s =>
      s.sku === barcode || s.barcode === barcode || s.upc === barcode || s.id === barcode
    )
    if (match) {
      addLineFromSku(match)
    } else {
      setManualSku(barcode)
      setError(`No SKU found for barcode: ${barcode}. Add it manually or scan again.`)
    }
    setStep('form')
    setScanTarget(null)
  }

  const updateLine = (i, field, value) => {
    const updated = [...lines]
    updated[i][field] = value
    setLines(updated)
  }

  const removeLine = (i) => {
    setLines(lines.filter((_, idx) => idx !== i))
  }

  const handleSubmit = async () => {
    if (!clientId) { setError('Please select a client.'); return }
    if (lines.length === 0) { setError('Add at least one item.'); return }
    setError('')
    setSaving(true)
    try {
      const receiptNumber = `REC-${Date.now().toString().slice(-6)}`
      await addDoc(collection(db, 'receipts'), {
        receiptNumber,
        clientId,
        clientName,
        refNumber,
        notes,
        status: 'Open',
        receivedDate: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
        lineItems: lines.map(l => ({
          skuId: l.skuId,
          sku: l.sku,
          description: l.description,
          expectedQty: l.qty,
          receivedQty: l.qty,
          pallets: l.pallets,
          condition: l.condition,
          location: l.location
        }))
      })

      // Update inventory
      for (const line of lines) {
        await addDoc(collection(db, 'inventory'), {
          skuId: line.skuId,
          sku: line.sku,
          description: line.description,
          clientId,
          clientName,
          qty: line.qty,
          pallets: line.pallets,
          condition: line.condition,
          location: line.location,
          status: 'available',
          receiptNumber,
          receivedDate: new Date().toISOString().split('T')[0],
          createdAt: serverTimestamp()
        })
      }

      setSaved(true)
    } catch (e) {
      setError('Failed to save receipt. Check your connection.')
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setClientId(''); setClientName(''); setRefNumber('')
    setNotes(''); setLines([]); setSaved(false); setError('')
  }

  const filteredSkus = skus.filter(s =>
    skuSearch === '' ||
    (s.sku || '').toLowerCase().includes(skuSearch.toLowerCase()) ||
    (s.description || s.name || '').toLowerCase().includes(skuSearch.toLowerCase())
  )

  if (step === 'scanning') {
    return (
      <BarcodeScanner
        title="Scan Item Barcode"
        onScan={handleScan}
        onClose={() => { setStep('form'); setScanTarget(null) }}
      />
    )
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
        <CheckCircle size={56} className="text-green-500" />
        <h2 className="text-xl font-bold text-gray-800">Receipt Saved!</h2>
        <p className="text-gray-500 text-sm">
          {lines.length} item{lines.length !== 1 ? 's' : ''} received for {clientName}
        </p>
        <button onClick={resetForm}
          className="mt-4 w-full bg-jct-navy text-white py-3 rounded-xl font-semibold text-base">
          Receive Another Shipment
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-4">

      {/* Header */}
      <div className="flex items-center gap-2">
        <PackagePlus size={20} className="text-jct-navy" />
        <h2 className="text-base font-bold text-gray-800">New Receipt</h2>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Client */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col gap-3">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</label>
        <div className="relative">
          <select value={clientId} onChange={e => handleClientChange(e.target.value)}
            className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 pr-8">
            <option value="">Select client...</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name || c.companyName}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" />
        </div>
        <input value={refNumber} onChange={e => setRefNumber(e.target.value)}
          placeholder="Reference / PO # (optional)"
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800" />
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Notes (optional)" rows={2}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 resize-none" />
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Items {lines.length > 0 && `(${lines.length})`}
          </label>
          <div className="flex gap-2">
            <button onClick={() => { setScanTarget('new'); setStep('scanning') }}
              className="flex items-center gap-1 bg-jct-red text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
              <ScanLine size={14} /> Scan
            </button>
            <button onClick={() => setShowSkuPicker(true)}
              className="flex items-center gap-1 bg-jct-navy text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
              <Search size={14} /> Browse
            </button>
          </div>
        </div>

        {lines.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-4">
            Scan a barcode or browse to add items
          </p>
        )}

        {lines.map((line, i) => (
          <div key={i} className="border border-gray-100 rounded-lg p-3 flex flex-col gap-2 bg-gray-50">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">{line.sku}</p>
                <p className="text-xs text-gray-500">{line.description}</p>
              </div>
              <button onClick={() => removeLine(i)} className="text-gray-300 hover:text-red-400 ml-2">
                <X size={16} />
              </button>
            </div>

            {/* Qty */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-12">Units</span>
              <button onClick={() => updateLine(i, 'qty', Math.max(1, line.qty - 1))}
                className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                <Minus size={12} />
              </button>
              <span className="text-sm font-semibold w-8 text-center">{line.qty}</span>
              <button onClick={() => updateLine(i, 'qty', line.qty + 1)}
                className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                <Plus size={12} />
              </button>
            </div>

            {/* Pallets */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-12">Pallets</span>
              <button onClick={() => updateLine(i, 'pallets', Math.max(1, line.pallets - 1))}
                className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                <Minus size={12} />
              </button>
              <span className="text-sm font-semibold w-8 text-center">{line.pallets}</span>
              <button onClick={() => updateLine(i, 'pallets', line.pallets + 1)}
                className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                <Plus size={12} />
              </button>
            </div>

            {/* Condition + Location */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select value={line.condition} onChange={e => updateLine(i, 'condition', e.target.value)}
                  className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs pr-6">
                  <option value="A">Condition A</option>
                  <option value="B">Condition B</option>
                  <option value="C">Condition C</option>
                </select>
                <ChevronDown size={12} className="absolute right-2 top-2 text-gray-400 pointer-events-none" />
              </div>
              <input value={line.location} onChange={e => updateLine(i, 'location', e.target.value)}
                placeholder="Location (e.g. A-01)"
                className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
            </div>
          </div>
        ))}
      </div>

      {/* Submit */}
      {lines.length > 0 && (
        <button onClick={handleSubmit} disabled={saving}
          className="w-full bg-jct-navy text-white py-3.5 rounded-xl font-semibold text-base disabled:opacity-50">
          {saving ? 'Saving...' : `Confirm Receipt (${lines.length} item${lines.length !== 1 ? 's' : ''})`}
        </button>
      )}

      {/* SKU Picker Modal */}
      {showSkuPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex flex-col justify-end">
          <div className="bg-white rounded-t-2xl flex flex-col max-h-[70vh]">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <span className="font-semibold text-gray-800">Select Item</span>
              <button onClick={() => { setShowSkuPicker(false); setSkuSearch('') }}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="px-4 pb-2">
              <input value={skuSearch} onChange={e => setSkuSearch(e.target.value)}
                placeholder="Search SKU or description..."
                autoFocus
                className="w-full bg-gray-100 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="overflow-y-auto flex-1 px-4 pb-6">
              {filteredSkus.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-6">No items found</p>
              )}
              {filteredSkus.map(s => (
                <button key={s.id} onClick={() => addLineFromSku(s)}
                  className="w-full text-left py-3 border-b border-gray-100 flex flex-col">
                  <span className="text-sm font-semibold text-gray-800">{s.sku || s.id}</span>
                  <span className="text-xs text-gray-400">{s.description || s.name || ''}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}