import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { lines } from '../lib/types'

interface Item {
  id: string
  name: string
}

// A master list the office maintains: add several names at once, remove one at a time.
function MasterList({ table, addLabel }: { table: 'task_catalog' | 'equipment_catalog'; addLabel: string }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from(table).select('id,name').order('name')
    setItems((data ?? []) as Item[])
  }, [table])

  useEffect(() => {
    load()
  }, [load])

  async function add() {
    setError('')
    const have = (items ?? []).map((i) => i.name.toLowerCase())
    const names = lines(text).filter((n, i, all) => !have.includes(n.toLowerCase()) && all.indexOf(n) === i)
    if (names.length) {
      const { error: err } = await supabase.from(table).insert(names.map((name) => ({ name })))
      if (err) {
        setError('Those were not added. Check your connection and try again.')
        return
      }
    }
    setText('')
    load()
  }

  async function remove(item: Item) {
    await supabase.from(table).delete().eq('id', item.id)
    load()
  }

  if (!items) return <p className="empty">Loading…</p>
  return (
    <>
      {items.length === 0 && <p className="empty">Nothing here yet. Add the first ones below.</p>}
      <ul className="rows">
        {items.map((i) => (
          <li key={i.id}>
            <span>{i.name}</span>
            <button className="linkbtn" onClick={() => remove(i)}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="field">
        <label className="label" htmlFor={`${table}New`}>{addLabel}</label>
        <textarea id={`${table}New`} value={text} onChange={(e) => setText(e.target.value)} placeholder="One per line. Paste a whole list to add them all at once." />
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="actions"><button className="btn small" onClick={add}>Add to list</button></div>
    </>
  )
}

export function TaskList() {
  return (
    <section className="sheet">
      <header className="sheet-head">
        <h1>Task list</h1>
        <p className="meta">Everything you offer schools and leagues. On each job you tick the ones that apply. Removing a task here does not take it off jobs that already have it.</p>
      </header>
      <MasterList table="task_catalog" addLabel="Add tasks" />
    </section>
  )
}

interface Kit {
  id: string
  name: string
  items: string[]
}

export function EquipmentList() {
  const [kits, setKits] = useState<Kit[]>([])
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [kitRes, itemRes] = await Promise.all([
      supabase.from('kits').select('id,name').order('name'),
      supabase.from('kit_items').select('kit_id,name').order('position'),
    ])
    setKits(
      (kitRes.data ?? []).map((k) => ({
        id: k.id as string,
        name: k.name as string,
        items: (itemRes.data ?? []).filter((i) => i.kit_id === k.id).map((i) => i.name as string),
      })),
    )
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function addKit() {
    setError('')
    const items = lines(text).filter((n, i, all) => all.indexOf(n) === i)
    if (!name.trim() || !items.length) {
      setError('Give the kit a name and at least one item.')
      return
    }
    const { data, error: err } = await supabase.from('kits').insert({ name: name.trim() }).select('id').single()
    if (err || !data) {
      setError(err?.code === '23505' ? 'A kit with that name already exists.' : 'The kit was not saved. Try again.')
      return
    }
    await supabase.from('kit_items').insert(items.map((n, position) => ({ kit_id: data.id, name: n, position })))
    setName('')
    setText('')
    load()
  }

  async function removeKit(k: Kit) {
    await supabase.from('kits').delete().eq('id', k.id)
    load()
  }

  return (
    <section className="sheet">
      <header className="sheet-head">
        <h1>Equipment list</h1>
        <p className="meta">Everything the studio owns or brings. On each job you tick items or drop in a whole kit instead of typing.</p>
      </header>
      <section className="sec">
        <h2>Items</h2>
        <MasterList table="equipment_catalog" addLabel="Add items" />
      </section>
      <section className="sec">
        <h2>Kits</h2>
        <p className="hint">A kit is a saved group of items you can add to a job in one tap.</p>
        {kits.map((k) => (
          <div className="note" key={k.id}>
            <strong>{k.name}</strong> <button className="linkbtn" onClick={() => removeKit(k)}>Remove kit</button>
            {'\n'}{k.items.join(', ')}
          </div>
        ))}
        <div className="field">
          <label className="label" htmlFor="kitName">New kit name</label>
          <input id="kitName" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="kitItems">Items in the kit</label>
          <textarea id="kitItems" value={text} onChange={(e) => setText(e.target.value)} placeholder="One item per line." />
        </div>
        {error && <p className="alert" role="alert">{error}</p>}
        <div className="actions"><button className="btn small" onClick={addKit}>Save kit</button></div>
      </section>
    </section>
  )
}
