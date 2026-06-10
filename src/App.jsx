import { useState } from 'react'
import { PackagePlus, Boxes, ClipboardList, Layers, Truck } from 'lucide-react'
import Receiving from './screens/Receiving'
import Orders from './screens/Orders'
import Inventory from './screens/Inventory'
import Waves from './screens/Waves'
import PutAway from './screens/PutAway'

const TABS = [
  { id: 'receive',   label: 'Receive',   icon: PackagePlus },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'orders',    label: 'Orders',    icon: ClipboardList },
  { id: 'waves',     label: 'Waves',     icon: Layers },
  { id: 'putaway',   label: 'Put Away',  icon: Truck },
]

export default function App() {
  const [tab, setTab] = useState('receive')
  return (
    <div className="flex flex-col h-[100dvh] bg-gray-100">
      <header className="bg-jct-navy text-white px-4 pb-3 shadow"
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <h1 className="text-lg font-bold">JCT Mobile</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {tab === 'receive'   && <Receiving />}
        {tab === 'inventory' && <Inventory />}
        {tab === 'orders' && <Orders />}
        {tab === 'waves'  && <Waves />}
        {tab === 'putaway' && <PutAway />}
      </main>

      <nav className="bg-white border-t border-gray-200 flex"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium ${
                active ? 'text-jct-red' : 'text-gray-400'}`}>
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              {t.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
