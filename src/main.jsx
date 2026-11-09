import React, { useEffect, useId, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Leaf, LayoutDashboard, Package, UtensilsCrossed, Sparkles, Settings2, ArrowUpRight,
  Plus, Search, Bell, ChevronDown, ArrowRight, Clock3, Check, ScanLine, X,
  Camera, UploadCloud, Send, ShieldCheck, History, Heart, CircleHelp, LoaderCircle,
  SlidersHorizontal, MoreHorizontal, Refrigerator, AlertTriangle, CheckCircle2,
  Minus, Trash2, Pencil, RefreshCw, MessageCircle, Sprout, Users, ChevronRight, LogOut,
} from 'lucide-react';
import './styles.css';
import './auth.css';
import './recipes.css';
import { validateRecipe } from '../server/domain.js';
import { recipeImage } from '../recipe-catalog.js';

const CATEGORIES = ['Vegetables', 'Fruit', 'Dairy & eggs', 'Protein', 'Drinks', 'Pantry'];
const UNITS = ['pcs', 'g', 'kg', 'ml', 'L', 'packs'];
const ALLERGENS = ['Milk', 'Eggs', 'Fish', 'Shellfish', 'Wheat', 'Soy', 'Peanuts', 'Tree nuts', 'Sesame'];
const ICONS = { Vegetables: '🥬', Fruit: '🍋', 'Dairy & eggs': '🥚', Protein: '🍗', Drinks: '🥛', Pantry: '🌾' };
const blankItem = () => ({ name: '', category: 'Vegetables', quantity: 1, unit: 'pcs', location: 'Fridge', expiry_date: null, date_type: 'Unknown', allergens: [], safety_status: 'Normal', condition_reviewed: false, notes: '' });
const photo = prompt => `https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=${encodeURIComponent(`${prompt}, editorial food photography, natural window light, warm cream background, realistic, beautifully styled, no text, no watermark`)}&image_size=landscape_4_3`;
const canCook = (recipe, state) => { try { validateRecipe(recipe, state.items, state.profile, state.today); return true; } catch { return false; } };
const days = (item, date) => item.expiry_date ? Math.round((Date.parse(item.expiry_date) - Date.parse(date)) / 86400000) : null;
const quantity = number => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(number);
const recordedDate = (timestamp, timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(timestamp ? new Date(timestamp) : new Date());
async function api(path, body, method = 'POST') {
  const response = await fetch(`/api${path}`, { method: body === undefined ? 'GET' : method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : { error: 'The kitchen service is starting or unavailable. Please retry in a moment.' };
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('cyan:signed-out'));
    const error = new Error(result.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return result;
}
function Button({ children, variant = 'primary', className = '', ...props }) {
  return <button className={`button ${variant} ${className}`} {...props}>{children}</button>;
}
function Badge({ status }) {
  return <span className={`badge ${status === 'Use first' ? 'amber' : status === 'In date' ? 'green' : status === 'Past date' || status === 'Check needed' ? 'red' : 'neutral'}`}><span />{status}</span>;
}
function Modal({ title, subtitle, children, onClose, wide = false }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const focusable = () => [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];
    focusable()[0]?.focus();
    const handler = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const elements = focusable(), first = elements[0], last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = old; previous?.focus?.(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={dialog} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
      <h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}{children}
    </section>
  </div>;
}
function ItemFields({ item, onChange, compact = false }) {
  const [showDate, setShowDate] = useState(Boolean(item.expiry_date));
  const dateFieldsId = useId();
  const set = (key, value) => onChange({ ...item, [key]: value });
  return <div className={`form-grid ${compact ? 'compact' : ''}`}>
    <label className="span-2">Food name<input required maxLength={80} value={item.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Cherry tomatoes" /></label>
    <label>Category<select value={item.category} onChange={e => set('category', e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
    <label>Storage<select value={item.location} onChange={e => set('location', e.target.value)}>{['Fridge', 'Freezer', 'Pantry', 'Counter'].map(c => <option key={c}>{c}</option>)}</select></label>
    <label>Quantity<input type="number" min=".01" max="100000" step="any" required value={item.quantity} onChange={e => set('quantity', Number(e.target.value))} /></label>
    <label>Unit<select value={item.unit} onChange={e => set('unit', e.target.value)}>{UNITS.map(c => <option key={c}>{c}</option>)}</select></label>
    <div className="span-2 package-date-section">
      <button className="text-button package-date-toggle" type="button" aria-expanded={showDate} aria-controls={dateFieldsId} onClick={() => setShowDate(!showDate)}><ChevronDown size={15} />Package expiry date (optional){!showDate && item.expiry_date && <span>{item.expiry_date}</span>}</button>
      {showDate && <div id={dateFieldsId} className="form-grid">
        <label>Expiry date on packaging<input type="text" lang="en" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" title="Use YYYY-MM-DD, for example 2026-11-20." maxLength={10} value={item.expiry_date || ''} onChange={e => onChange({ ...item, expiry_date: e.target.value || null, date_type: e.target.value ? (item.date_type === 'Unknown' ? 'Best before' : item.date_type) : 'Unknown' })} /></label>
        <label>Package date label<select value={item.date_type} onChange={e => set('date_type', e.target.value)}>{['Unknown', 'Use by', 'Best before'].map(c => <option key={c}>{c}</option>)}</select></label>
        <small className="span-2">Use the date printed on the package. Leave blank if there is no date; you can still save this food.</small>
      </div>}
    </div>
    <label>Condition<select value={item.safety_status} onChange={e => set('safety_status', e.target.value)}><option>Normal</option><option>Check needed</option></select></label>
    <label>Notes<input maxLength={300} value={item.notes} onChange={e => set('notes', e.target.value)} placeholder="Storage or label details" /></label>
    {!item.expiry_date && <label className="span-2 confirm-checkbox"><input type="checkbox" checked={Boolean(item.condition_reviewed)} onChange={e => set('condition_reviewed', e.target.checked)} />I checked this food’s condition and storage and want to include it in meal ideas. This does not set an expiry date.</label>}
    <fieldset className="span-2 allergen-field"><legend>Allergens — check the packaging</legend><div className="check-chips">{ALLERGENS.map(a => <label key={a}><input type="checkbox" checked={item.allergens.includes(a)} onChange={e => set('allergens', e.target.checked ? [...item.allergens, a] : item.allergens.filter(x => x !== a))} />{a}</label>)}</div></fieldset>
  </div>;
}
function RecordingDate({ timestamp, timezone, batch = false }) {
  return <div className="recording-date"><Clock3 size={18} /><div><span>{timestamp ? 'Recorded on' : 'Recording date'} <strong>{recordedDate(timestamp, timezone)}</strong></span><small>{timestamp ? 'Saved automatically when this food was added.' : batch ? 'Today is saved automatically for every item in this batch. No date entry needed.' : 'Today is saved automatically when you add this food.'}</small></div></div>;
}
function AddModal({ edit, onClose, run, state }) {
  const [item, setItem] = useState(edit || blankItem());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <Modal title={edit ? 'Edit food item' : 'A new addition to your kitchen'} subtitle="Check the food and quantity. Package expiry dates are optional." onClose={onClose}>
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await run(edit ? `/items/${edit.id}` : '/items', edit ? item : { confirmed: true, items: [item] }, edit ? 'PATCH' : 'POST'); onClose(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>
      <RecordingDate timestamp={edit?.created_at} timezone={state.profile.timezone} />
      <ItemFields item={item} onChange={setItem} />
      <p className="info-line"><ShieldCheck size={16} /> Dates organize your food; they do not establish food safety.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="modal-actions"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{edit ? 'Save correction' : 'Confirm & add food'}</Button></div>
    </form>
  </Modal>;
}
function ScanModal({ onClose, run, state }) {
  const [image, setImage] = useState(null);
  const [description, setDescription] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadImage = file => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Choose a JPEG, PNG, or WebP photo smaller than 5 MB.'); return; }
    setError('');
    const reader = new FileReader(); reader.onload = () => setImage(reader.result); reader.readAsDataURL(file);
  };
  return <Modal wide title={result ? 'A quick check before adding' : 'From grocery bag to inventory'} subtitle={result ? 'Agent A has prepared a draft. You have the final say.' : 'Take a photo, upload a receipt, or describe your groceries.'} onClose={onClose}>
    <div className="stepper"><span className={result ? 'done' : 'active'}>1 <span>Capture</span></span><ChevronRight size={15} /><span className={result ? 'active' : ''}>2 <span>Review</span></span><ChevronRight size={15} /><span>3 <span>Save</span></span></div>
    {!state.connection.ai && <div className="notice"><Sparkles size={18} /><div><strong>Course demo mode</strong><p>Recognition is simulated. To analyze actual photos, configure a vision model in the server’s .env file.</p></div></div>}
    {!result ? <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { setResult(await api('/recognize', { ...(image ? { image } : {}), ...(description ? { text: description } : {}) })); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>
      <label className="upload-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); loadImage(e.dataTransfer.files[0]); }}>
        {image ? <img src={image} alt="Your uploaded groceries" /> : <><div className="upload-icon"><Camera size={30} /></div><strong>A photo is worth a full pantry</strong><span>Drop an image here, or click to upload</span><small>JPEG, PNG, WebP · up to 5 MB</small></>}
        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload grocery photo" onChange={e => loadImage(e.target.files[0])} />
      </label>
      <label className="full-label">Or tell us what you brought home<textarea value={description} maxLength={2000} onChange={e => setDescription(e.target.value)} placeholder="e.g. 6 tomatoes, 3 bananas, and a carton of milk..." rows={3} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="modal-actions"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button disabled={busy || (!image && !description)}>{busy ? <LoaderCircle className="spin" size={16} /> : <ScanLine size={16} />}{busy ? 'Preparing draft…' : 'Identify groceries'}</Button></div>
    </form> : <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await run('/items', { confirmed: true, source: result.source, items: result.items }); onClose(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>
      <RecordingDate timezone={state.profile.timezone} batch />
      <p className="review-warning"><AlertTriangle size={16} />{result.warning}</p>
      {result.items.map((item, index) => <div className="review-item" key={index}><div className="section-row"><h3>Item {index + 1}</h3><button className="text-button" type="button" onClick={() => setResult({ ...result, items: result.items.filter((_, i) => i !== index) })}><Trash2 size={15} />Remove</button></div><ItemFields compact item={item} onChange={newItem => setResult({ ...result, items: result.items.map((i, n) => n === index ? newItem : i) })} /></div>)}
      {!result.items.length && <p className="empty">No food items in this draft. Try another photo or add them manually.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="modal-actions"><Button variant="secondary" type="button" onClick={() => setResult(null)}>Back to capture</Button><Button disabled={busy || !result.items.length}>{busy ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />}Confirm & save {result.items.length} items</Button></div>
    </form>}
  </Modal>;
}
function AdjustModal({ item, onClose, run }) {
  const [amount, setAmount] = useState(Math.min(1, item.quantity));
  const [reason, setReason] = useState('Used');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <Modal title={`Update ${item.name}`} subtitle={`${quantity(item.quantity)} ${item.unit} currently in your ${item.location.toLowerCase()}.`} onClose={onClose}>
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); try { await run(`/items/${item.id}/adjust`, { quantity: amount, reason }); onClose(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>
      <div className="form-grid"><label>Amount ({item.unit})<input type="number" step="any" min=".01" max={item.quantity} required value={amount} onChange={e => setAmount(Number(e.target.value))} /></label><label>What happened?<select value={reason} onChange={e => setReason(e.target.value)}><option>Used</option><option>Discarded</option></select></label></div>
      <p className="info-line">Remaining after update: {quantity(Math.max(0, item.quantity - amount))} {item.unit}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="modal-actions"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button disabled={busy}>Confirm stock update</Button></div>
    </form>
  </Modal>;
}
function InventoryTable({ items, state, onEdit, onAdjust, limit }) {
  return <div className="table-wrap"><table><thead><tr><th>Food item</th><th>Quantity</th><th>Storage</th><th>Recorded on</th><th>Package date</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
    {items.slice(0, limit || items.length).map(item => <tr key={item.id}>
      <td><div className="food-cell"><span className={`food-icon cat-${CATEGORIES.indexOf(item.category)}`}>{ICONS[item.category]}</span><div><strong>{item.name}</strong><small>{item.category}{item.source.includes('Demo') ? ' · Sample' : ''}</small></div></div></td>
      <td>{quantity(item.quantity)} <span className="muted">{item.unit}</span></td>
      <td><span className="storage"><Refrigerator size={13} />{item.location}</span></td>
      <td><time dateTime={item.created_at}>{recordedDate(item.created_at, state.profile.timezone)}</time></td>
      <td>{item.expiry_date ? <><span>{new Date(`${item.expiry_date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span><small>{days(item, state.today) < 0 ? 'Past recorded date' : days(item, state.today) === 0 ? 'Today' : `${days(item, state.today)} days left`}</small></> : <span className="muted">Check label</span>}</td>
      <td><Badge status={item.status} /></td>
      <td><div className="row-actions"><button className="icon-button" title="Edit item" aria-label={`Edit ${item.name}`} onClick={() => onEdit(item)}><Pencil size={14} /></button><button className="icon-button" title="Use or discard" aria-label={`Update stock for ${item.name}`} onClick={() => onAdjust(item)}><Minus size={16} /></button></div></td>
    </tr>)}
    {!items.length && <tr><td colSpan={7}><div className="empty"><Package size={30} /><p>No food here yet. Add your first grocery haul.</p></div></td></tr>}
  </tbody></table></div>;
}
function RecipeCard({ recipe, index, state, onOpen }) {
  const r = recipe.data;
  const available = canCook(r, state);
  const useFirst = r.ingredients.filter(x => state.items.find(i => i.id === x.item_id)?.status === 'Use first').length;
  const image = recipeImage(r, state.items);
  return <button className="recipe-card" onClick={() => onOpen(recipe)}>
    <div className="recipe-image"><img src={image.image_url} alt={image.image_alt} loading="lazy" /><span className="photo-caption">{image.image_label}</span><span className="recipe-label">{!available ? 'Review required' : useFirst ? <><Leaf size={12} /> Uses {useFirst} use-first {useFirst === 1 ? 'item' : 'items'}</> : <><Heart size={12} /> Made for your kitchen</>}</span><div className="recipe-open"><ArrowUpRight size={18} /></div></div>
    <div className="recipe-body"><div className="recipe-meta"><span><Clock3 size={13} />{r.minutes} min</span><span>{r.servings} {r.servings === 1 ? 'serving' : 'servings'}</span></div><h3>{r.title}</h3><p>{r.description}</p><div className="recipe-tags">{r.tags.slice(0, 2).map(t => <span key={t}>{t}</span>)}</div></div>
  </button>;
}
function RecipeModal({ recipe, state, onClose, run }) {
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const r = recipe.data;
  const image = recipeImage(r, state.items);
  const available = canCook(r, state);
  return <Modal title={r.title} subtitle={`${r.minutes} minutes · ${r.servings} ${r.servings === 1 ? 'serving' : 'servings'} · ${recipe.source}`} onClose={onClose} wide>
    <figure className="recipe-detail-photo"><img src={image.image_url} alt={image.image_alt} /><figcaption>{image.image_label}</figcaption></figure>
    {!available && <p className="error" role="alert">This idea needs review: stock, food condition, dates or preferences have changed. Update your inventory or prepare new ideas.</p>}
    <p>{r.description}</p><div className="recipe-detail-grid"><section><h3>From your kitchen</h3>{r.ingredients.map(x => { const i = state.items.find(i => i.id === x.item_id); return <div className="ingredient" key={x.item_id}><span>{i?.name || 'Item no longer available'}</span><strong>{quantity(x.quantity)} {x.unit}</strong></div>; })}<div className="health-note"><Heart size={18} /><p>{r.health_note}</p></div></section><section><h3>Let’s make it</h3><ol className="recipe-steps">{r.steps.map((step, i) => <li key={i}>{step}</li>)}</ol></section></div>
    <div className="notice"><ShieldCheck size={18} /><p>Check food condition, storage, package instructions, and allergens before cooking. Date status is not a safety guarantee. This is general meal inspiration.</p></div>
    <label className="confirm-checkbox"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} />I cooked this meal and used the ingredient quantities shown above.</label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Keep as an idea</Button><Button disabled={!available || !approved || busy} onClick={async () => { setBusy(true); try { await run(`/recipes/${recipe.id}/cook`, { confirmed: true }); onClose(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Record meal & update stock</Button></div>
  </Modal>;
}
function Overview({ state, setView, setModal, generate, generating }) {
  const useFirst = state.items.filter(i => i.status === 'Use first');
  const check = state.items.filter(i => ['Past date', 'Check needed', 'Date unknown'].includes(i.status));
  const count = new Set(state.items.map(i => i.category)).size;
  const used = state.activity.filter(a => a.action === 'Food used' || a.action === 'Meal cooked & stock updated').length;
  return <>
    <div className="page-heading"><div className="eyebrow">YOUR KITCHEN, A LITTLE MORE CONNECTED</div><h1>Good food. Less waste<span>.</span></h1><p>A little awareness goes a long way. Here’s what’s in your kitchen.</p><div className="heading-actions"><Button variant="secondary" onClick={() => setModal({ type: 'scan' })}><ScanLine size={16} />Scan groceries</Button><Button onClick={() => setModal({ type: 'add' })}><Plus size={17} />Add food</Button></div></div>
    <div className="stats-grid">
      {[{ label: 'In your kitchen', value: state.items.length, note: `Across ${count} food categories`, icon: Package, color: 'sage' }, { label: 'Ready to use first', value: useFirst.length, note: 'Within 3 days of their date', icon: Clock3, color: 'peach' }, { label: 'Need a quick check', value: check.length, note: 'Missing dates or flagged items', icon: ShieldCheck, color: 'lavender' }, { label: 'Food put to good use', value: used, note: 'Confirmed meals & uses', icon: Sprout, color: 'blue' }].map(s => <div className="stat-card" key={s.label}><div className="stat-top"><span>{s.label}</span><div className={`stat-icon ${s.color}`}><s.icon size={18} /></div></div><strong>{s.value}<span>{s.label === 'In your kitchen' ? 'items' : s.label === 'Food put to good use' ? 'actions' : 'items'}</span></strong><p>{s.note}</p></div>)}
    </div>
    <div className="use-first-banner"><div className="banner-icon"><Leaf size={24} /></div><div><strong>{useFirst.length ? 'Good things shouldn’t go to waste.' : 'Your kitchen is looking good.'}</strong><p>{useFirst.length ? <>{useFirst.slice(0, 2).map(i => i.name.toLowerCase()).join(' and ')} are up first. Let’s turn them into something delicious.</> : 'Keep dates up to date and check your food before you cook.'}</p></div><button onClick={() => { setView('meals'); if (!state.recipes.length) generate(); }}>Find a meal <ArrowRight size={16} /></button></div>
    <div className="overview-grid"><section className="panel inventory-panel"><div className="panel-heading"><div><h2>Your kitchen at a glance</h2><p>The essentials, all in one place.</p></div><button className="text-button" onClick={() => setView('inventory')}>View inventory <ArrowUpRight size={15} /></button></div><InventoryTable items={state.items} state={state} limit={5} onEdit={i => setModal({ type: 'edit', item: i })} onAdjust={i => setModal({ type: 'adjust', item: i })} /><div className="table-footer"><span>Showing {Math.min(state.items.length, 5)} of {state.items.length} items</span><span><span className="dot" />Synced with your household</span></div></section>
      <aside className="assistant-card"><div className="assistant-orbit"><Sparkles size={25} /></div><span className="eyebrow">A LITTLE HELP FROM CYAN</span><h2>Your kitchen.<br />Your kind of healthy.</h2><p>Tell us what feels good for you. We’ll help connect your food with your everyday preferences.</p><div className="preference-pill"><Heart size={13} />{state.profile.diet} · {state.profile.goal}</div><Button variant="white" onClick={() => setView('assistant')}>Let’s chat <MessageCircle size={16} /></Button><small>Suggestions, with you in control.</small></aside>
    </div>
    <section className="meal-section"><div className="section-row"><div><div className="eyebrow">FROM WHAT YOU ALREADY HAVE</div><h2>A little inspiration for your next meal</h2></div><button className="text-button" onClick={() => { setView('meals'); if (!state.recipes.length) generate(); }}>Explore meal ideas <ArrowUpRight size={15} /></button></div>{state.recipes.length ? <div className="recipe-grid">{state.recipes.map((r, i) => <RecipeCard key={r.id} recipe={r} index={i} state={state} onOpen={r => setModal({ type: 'recipe', recipe: r })} />)}</div> : <div className="empty meal-empty"><UtensilsCrossed size={30} /><div><h3>Something good is already in your kitchen.</h3><p>Prepare meal ideas using your inventory and saved preferences.</p></div><Button variant="secondary" disabled={generating} onClick={generate}>{generating ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{generating ? 'Preparing ideas…' : 'Find my next meal'}</Button></div>}</section>
    <div className="bottom-note"><Leaf size={13} /> Small kitchen habits. A meaningful difference.</div>
  </>;
}
function Inventory({ state, setModal, search, setSearch }) {
  const [category, setCategory] = useState('All food');
  const [status, setStatus] = useState('All statuses');
  const [location, setLocation] = useState('All storage');
  const filtered = state.items.filter(i => (category === 'All food' || i.category === category) && (status === 'All statuses' || i.status === status) && (location === 'All storage' || i.location === location) && `${i.name} ${i.category}`.toLowerCase().includes(search.toLowerCase()));
  return <><div className="page-heading"><div className="eyebrow">KNOW WHAT YOU HAVE</div><h1>Your kitchen inventory<span>.</span></h1><p>Every ingredient, every batch. A clearer picture of what’s at home.</p><div className="heading-actions"><Button variant="secondary" onClick={() => setModal({ type: 'scan' })}><ScanLine size={16} />Scan groceries</Button><Button onClick={() => setModal({ type: 'add' })}><Plus size={16} />Add food</Button></div></div>
    <div className="category-tabs">{['All food', ...CATEGORIES].map(c => <button key={c} className={category === c ? 'selected' : ''} onClick={() => setCategory(c)}>{c !== 'All food' && <span>{ICONS[c]}</span>}{c}<small>{state.items.filter(i => c === 'All food' || i.category === c).length}</small></button>)}</div>
    <section className="panel"><div className="inventory-filters"><div className="search-field"><Search size={16} /><input aria-label="Search food inventory" placeholder="Find something in your kitchen..." value={search} onChange={e => setSearch(e.target.value)} /></div><select aria-label="Filter food status" value={status} onChange={e => setStatus(e.target.value)}>{['All statuses', 'Use first', 'In date', 'Past date', 'Date unknown', 'Check needed'].map(c => <option key={c}>{c}</option>)}</select><select aria-label="Filter storage" value={location} onChange={e => setLocation(e.target.value)}>{['All storage', 'Fridge', 'Freezer', 'Pantry', 'Counter'].map(c => <option key={c}>{c}</option>)}</select></div><InventoryTable items={filtered} state={state} onEdit={i => setModal({ type: 'edit', item: i })} onAdjust={i => setModal({ type: 'adjust', item: i })} /><div className="table-footer"><span>{filtered.length} food batches</span><span>Each purchase keeps its own package date.</span></div></section>
    <div className="notice standalone"><ShieldCheck size={18} /><p>“Use first” means the recorded package date is within 3 days. Past-date and flagged food stays out of planning. For food without a package date, open Edit and confirm its condition and storage to include it.</p></div></>;
}
function Meals({ state, setModal, generate, generating, setView }) {
  return <><div className="page-heading"><div className="eyebrow">MAKE THE MOST OF WHAT’S HERE</div><h1>Good ideas, already at home<span>.</span></h1><p>Meals shaped by your ingredients, your preferences, and what needs using first.</p><div className="heading-actions"><Button disabled={generating} onClick={generate}>{generating ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}{generating ? 'Preparing ideas…' : 'Refresh meal ideas'}</Button></div></div>
    <div className="meal-preferences"><Heart size={20} /><div><strong>{state.profile.diet} · {state.profile.goal}</strong><p>{state.profile.allergies.length ? `Excluding: ${state.profile.allergies.join(', ')}` : 'No allergen exclusions saved. Add yours before planning.'}</p></div><button className="text-button" onClick={() => setView('settings')}>Edit preferences <ArrowRight size={15} /></button></div>
    {!state.connection.ai && <div className="notice standalone"><Sparkles size={18} /><p>Demo recipe rules are active. These sample plans match available inventory; they are not generated by a live model. Each plan is an alternative, and stock is checked again when you record cooking.</p></div>}
    {state.recipes.length ? <div className="recipe-grid meals-page">{state.recipes.map((r, i) => <RecipeCard key={r.id} recipe={r} index={i} state={state} onOpen={r => setModal({ type: 'recipe', recipe: r })} />)}</div> : <div className="panel empty tall"><UtensilsCrossed size={42} /><h2>Your next meal starts here.</h2><p>Add food with a package date, or confirm condition and storage for undated food in Inventory. Ideas respect your saved preferences.</p><Button disabled={generating} onClick={generate}>Prepare meal ideas <Sparkles size={16} /></Button></div>}
    <section className="how-it-works"><div><span>01</span><h3>Start with your kitchen</h3><p>In-stock food with a current package date or your explicit condition review can be included. Flagged food stays out.</p></div><div><span>02</span><h3>Make it yours</h3><p>Ingredient rules select dishes; text AI adjusts the plan. Photos are serving inspiration.</p></div><div><span>03</span><h3>You have the final say</h3><p>Review the plan. After cooking, confirm the quantities you used.</p></div></section></>;
}
function Assistant({ state, run, refresh }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const send = async value => {
    if (!value.trim() || busy) return;
    setBusy(true); setPending(value); setMessage(''); setError('');
    try { const result = await api('/chat', { message: value }); setProposal(result.proposed_profile); await refresh(); } catch (e) { setError(e.message); setMessage(value); } finally { setBusy(false); setPending(''); }
  };
  return <><div className="page-heading"><div className="eyebrow">YOUR EVERYDAY KITCHEN COMPANION</div><h1>A little conversation. A better plan<span>.</span></h1><p>Connect what’s in your kitchen with what matters to you.</p></div><div className="chat-layout"><section className="panel chat-panel"><div className="chat-heading"><div className="chat-avatar"><Sparkles size={21} /></div><div><h3>Cyan assistant</h3><p>{state.connection.ai ? `Connected · ${state.connection.model}` : 'Demo assistant · simulated conversation'}</p></div><span className="chat-status"><span className="dot" />{state.connection.ai ? 'AI enabled' : 'Demo mode'}</span></div><div className="messages" aria-live="polite">
      <div className="message assistant"><div className="mini-avatar"><Leaf size={16} /></div><div><p>Hello! I’m Cyan. Tell me about your food preferences, or ask what to use first. You decide what changes get saved.</p><small>Your kitchen companion</small></div></div>
      {state.messages.map(m => <div className={`message ${m.role}`} key={m.id}>{m.role === 'assistant' && <div className="mini-avatar"><Leaf size={16} /></div>}<div><p>{m.content}</p></div></div>)}
      {pending && <div className="message user"><div><p>{pending}</p></div></div>}
      {busy && <div className="message assistant"><div className="mini-avatar"><Leaf size={16} /></div><div><p className="thinking"><span /><span /><span /></p></div></div>}
      {proposal && <div className="proposal"><h3><ShieldCheck size={17} />Review a preference update</h3>{Object.entries(proposal).map(([key, value]) => <p key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{Array.isArray(value) ? value.join(', ') || 'None' : value}</strong></p>)}<div><Button disabled={busy} onClick={async () => { setBusy(true); try { await run('/profile', { ...state.profile, ...proposal }, 'PUT'); setProposal(null); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Approve & save</Button><Button variant="ghost" onClick={() => setProposal(null)}>Keep current preferences</Button></div></div>}
    </div><div className="chat-bottom">{!state.messages.length && <div className="prompt-chips">{['What should I use first?', 'I would like more protein', 'Help me eat less salt'].map(p => <button key={p} disabled={busy} onClick={() => send(p)}>{p}<ArrowUpRight size={13} /></button>)}</div>}{error && <p className="error" role="alert">{error}</p>}<form className="chat-input" onSubmit={e => { e.preventDefault(); send(message); }}><input value={message} maxLength={2000} onChange={e => setMessage(e.target.value)} placeholder="What’s on your mind, or on your menu?" aria-label="Message Cyan assistant" /><button disabled={busy || !message.trim()} aria-label="Send message"><Send size={17} /></button></form><p className="chat-disclaimer">General wellbeing support. Not medical advice. Preferences change only with your approval.</p></div></section><aside className="chat-context"><div className="panel context-card"><Heart size={22} /><h3>What matters to you</h3><label>Eating preference<strong>{state.profile.diet}</strong></label><label>Everyday goal<strong>{state.profile.goal}</strong></label><label>Allergen exclusions<strong>{state.profile.allergies.join(', ') || 'None saved'}</strong></label></div><div className="panel context-card"><Leaf size={22} /><h3>Use these first</h3>{state.items.filter(i => i.status === 'Use first').slice(0, 4).map(i => <div className="context-item" key={i.id}><span>{ICONS[i.category]} {i.name}</span><small>{days(i, state.today)}d</small></div>)}</div><div className="context-foot"><ShieldCheck size={18} /><p>Your inventory is context. Suggestions stay suggestions until you approve.</p></div></aside></div></>;
}
function HouseholdSettings({ state, run }) {
  const [profile, setProfile] = useState(state.profile);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => { setProfile({ ...profile, [key]: value }); setSaved(false); };
  return <><div className="page-heading"><div className="eyebrow">A HOUSEHOLD THAT FEELS LIKE YOU</div><h1>The little details that matter<span>.</span></h1><p>Your preferences help Cyan make more thoughtful suggestions.</p></div><div className="settings-grid"><form className="panel settings-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await run('/profile', profile, 'PUT'); setSaved(true); } catch (e) { setError(e.message); } finally { setBusy(false); } }}><div className="panel-heading"><div><h2>Household & wellbeing</h2><p>Use fictional preferences for your course presentation.</p></div><Users size={20} /></div><div className="form-grid"><label>Household name<input value={profile.household_name} maxLength={60} required onChange={e => set('household_name', e.target.value)} /></label><label>People at home<input type="number" min="1" max="12" value={profile.household_size} onChange={e => set('household_size', Number(e.target.value))} /></label><label>Eating preference<select value={profile.diet} onChange={e => set('diet', e.target.value)}>{['Balanced', 'Vegetarian', 'Vegan', 'Pescatarian'].map(x => <option key={x}>{x}</option>)}</select></label><label>Everyday goal<select value={profile.goal} onChange={e => set('goal', e.target.value)}>{['Everyday wellbeing', 'More protein', 'More vegetables', 'Lower sodium'].map(x => <option key={x}>{x}</option>)}</select></label><label className="span-2">Foods you prefer to avoid<input placeholder="Comma-separated, e.g. mushrooms, olives" maxLength={200} value={profile.dislikes} onChange={e => set('dislikes', e.target.value)} /></label><fieldset className="allergen-field span-2"><legend>Allergen exclusions</legend><div className="check-chips">{ALLERGENS.map(a => <label key={a}><input type="checkbox" checked={profile.allergies.includes(a)} onChange={e => set('allergies', e.target.checked ? [...profile.allergies, a] : profile.allergies.filter(x => x !== a))} />{a}</label>)}</div><small>Known name matches and your saved labels are excluded. Always verify the packaging yourself.</small></fieldset><label className="span-2">Household time zone<select value={profile.timezone} onChange={e => set('timezone', e.target.value)}>{['Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'].map(x => <option key={x}>{x}</option>)}</select></label></div>{error && <p className="error" role="alert">{error}</p>}<div className="settings-footer">{saved && <span className="saved"><CheckCircle2 size={16} />Preferences saved</span>}<Button disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Approve & save preferences</Button></div></form><aside><div className="panel connection-card"><h3>Your connections</h3><div><span className="stat-icon sage"><Package size={19} /></span><p><strong>Neon PostgreSQL</strong><small>Persistent household storage</small></p><Badge status="Connected" /></div><div><span className="stat-icon lavender"><Sparkles size={19} /></span><p><strong>{state.connection.ai ? 'AI model' : 'Demo intelligence'}</strong><small>{state.connection.model || 'Simulated recognition & chat'}</small></p></div><p className="setup-note">For live AI, add <code>AI_API_KEY</code>, <code>AI_BASE_URL</code>, and <code>AI_MODEL</code> to the private server .env file, then restart. Use a model that supports images.</p></div><div className="panel privacy-card"><ShieldCheck size={24} /><h3>You stay in control.</h3><p>Your signed-in account has its own inventory, preferences, and history. Cyan does not make purchases, extend recorded dates, or automatically change your preferences.</p><p>When enabled, AI receives the photo you submit and relevant inventory and preferences from your account. Use fictional course data.</p></div></aside></div></>;
}
function Activity({ state, run }) {
  const [category, setCategory] = useState('Workflow improvement');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <><div className="page-heading"><div className="eyebrow">A CLEAR TRAIL, A BETTER TOMORROW</div><h1>Every little action counts<span>.</span></h1><p>See what happened, who approved it, and what could work better.</p></div><div className="agent-strip">{[{ label: 'A · Sensing', title: 'Notice & prepare', note: 'Food detection → your review', icon: ScanLine }, { label: 'B · Seizing', title: 'Plan & coordinate', note: 'Inventory → meal drafts → approval', icon: UtensilsCrossed }, { label: 'C · Reconfiguring', title: 'Review & improve', note: 'Feedback → human review', icon: RefreshCw }].map(a => <div className="panel" key={a.label}><a.icon size={22} /><span>{a.label}</span><h3>{a.title}</h3><p>{a.note}</p></div>)}</div><div className="activity-layout"><section className="panel"><div className="panel-heading"><div><h2>Household activity</h2><p>Recorded actions and human approval points.</p></div><History size={19} /></div><div className="timeline">{state.activity.map(a => <div className="timeline-item" key={a.id}><span className="timeline-point"><Check size={12} /></span><div><div className="section-row"><strong>{a.action}</strong><time>{new Date(a.created_at).toLocaleString('en-GB', { timeZone: state.profile.timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></div><p>{a.detail}</p><small>{a.agent}</small></div></div>)}</div></section><aside><form className="panel feedback-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await run('/feedback', { category, message }); setMessage(''); } catch (e) { setError(e.message); } finally { setBusy(false); } }}><h3>Help Cyan do a little better</h3><p>Feedback is queued for review. It does not automatically retrain the model or change rules.</p><label>What is this about?<select value={category} onChange={e => setCategory(e.target.value)}>{['Workflow improvement', 'Recognition correction', 'Meal suggestion', 'Other'].map(x => <option key={x}>{x}</option>)}</select></label><label>Your suggestion<textarea value={message} minLength={3} maxLength={2000} required rows={4} onChange={e => setMessage(e.target.value)} placeholder="What would make this work better for your household?" /></label>{error && <p className="error">{error}</p>}<Button disabled={busy}>Send for review <ArrowRight size={16} /></Button></form>{state.feedback.map(f => <div className="panel feedback-entry" key={f.id}><span className="badge neutral">Pending human review</span><strong>{f.category}</strong><p>{f.message}</p></div>)}</aside></div></>;
}
function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [openingDemo, setOpeningDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const registering = mode === 'register';
  return <div className="auth-page">
    <section className="auth-story">
      <a href="/" className="brand auth-brand"><span className="brand-mark"><Leaf size={23} /></span>cyan<span className="brand-period">.</span></a>
      <div className="auth-story-copy"><span className="eyebrow">A LITTLE LESS WASTE. A LITTLE MORE GOOD.</span><h1>Good things<br />start at home<span>.</span></h1><p>Your own kitchen inventory. Thoughtful meal ideas.<br />A little more room for everyday living.</p></div>
      <div className="auth-photo"><img src={photo('A sunlit home kitchen counter with a paper grocery bag, fresh tomatoes, bananas, leafy spinach and lemons, warm natural materials, wide editorial composition')} alt="Fresh groceries on a sunlit kitchen counter" /><span><Leaf size={15} />Make the most of what’s already here.</span></div>
      <div className="auth-story-footer"><span>Cyan · Climbing Cat</span><span>Thoughtful kitchens, one household at a time.</span></div>
    </section>
    <section className="auth-main"><div className="auth-form-wrap">
      <div className="auth-tabs" aria-label="Account access">{[['login', 'Sign in'], ['register', 'Create account']].map(([value, label]) => <button key={value} disabled={busy} className={mode === value ? 'selected' : ''} onClick={() => { setMode(value); setPassword(''); setError(''); }}>{label}</button>)}
        <button className="auth-demo-entry" disabled={busy} title="Open the editable sample kitchen" onClick={async () => {
          setBusy(true); setOpeningDemo(true); setError('');
          try { await api('/auth/demo', {}); await onAuthenticated(); }
          catch (e) { setError(e.message); } finally { setBusy(false); setOpeningDemo(false); }
        }}>{openingDemo ? 'Opening…' : 'Try demo'}{openingDemo ? <LoaderCircle className="spin" size={13} /> : <ArrowUpRight size={13} />}</button>
      </div>
      <div className="eyebrow">YOUR KITCHEN, YOUR SPACE</div><h2>{registering ? 'Make yourself at home.' : 'Welcome home.'}</h2><p className="auth-intro">{registering ? 'Create an account and start your own kitchen inventory.' : 'Sign in to pick up where you left off.'}</p>
      <form onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError('');
        try { await api(`/auth/${mode}`, { username, password }); await onAuthenticated(); }
        catch (e) { setError(e.message); } finally { setBusy(false); }
      }}>
        <label htmlFor="auth-username">Email or username<input id="auth-username" name="username" autoComplete="username" required maxLength={254} value={username} onChange={e => setUsername(e.target.value)} placeholder="you@example.com" autoCapitalize="none" spellCheck={false} disabled={busy} /></label>
        {registering && <p className="auth-field-note">An email is handy, but any username works.</p>}
        <label htmlFor="auth-password">Password<div className="password-field"><input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} required minLength={1} maxLength={256} value={password} onChange={e => setPassword(e.target.value)} placeholder={registering ? 'Choose your password' : 'Enter your password'} disabled={busy} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
        {registering && <p className="auth-field-note">No complexity rules. Choose any non-empty password.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <Button className="auth-submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}{busy ? 'Opening your kitchen…' : registering ? 'Create my account' : 'Sign in'}</Button>
      </form>
      <p className="auth-switch">{registering ? 'Already have an account?' : 'New to Cyan?'} <button disabled={busy} onClick={() => { setMode(registering ? 'login' : 'register'); setPassword(''); setError(''); }}>{registering ? 'Sign in' : 'Create an account'}</button></p>
      <p className="auth-demo-note">Try demo opens a shared, editable sample kitchen.</p>
      <div className="auth-privacy"><ShieldCheck size={19} /><p>Your account has its own inventory, preferences, and history. You decide what gets added and used.</p></div>
    </div><small className="auth-course">ECOM7121 · An English-language course prototype</small></section>
  </div>;
}
function App() {
  const [state, setState] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const authEpoch = useRef(0);
  const [view, setView] = useState('overview');
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [generating, setGenerating] = useState(false);
  const refresh = async () => {
    const epoch = authEpoch.current;
    const result = await api('/state');
    if (epoch === authEpoch.current) { setState(result); setAuthChecked(true); }
    return result;
  };
  const resetAccount = () => {
    authEpoch.current++;
    setState(null); setModal(null); setSearch(''); setView('overview');
    setError(''); setToast(''); setGenerating(false); setAuthChecked(true);
  };
  useEffect(() => {
    const signedOut = () => resetAccount();
    window.addEventListener('cyan:signed-out', signedOut);
    return () => window.removeEventListener('cyan:signed-out', signedOut);
  }, []);
  useEffect(() => {
    let active = true, timer;
    const load = async attempt => {
      const epoch = authEpoch.current;
      try { const result = await api('/state'); if (active && epoch === authEpoch.current) { setState(result); setAuthChecked(true); } }
      catch (e) {
        if (!active) return;
        if (e.status === 401) { setAuthChecked(true); return; }
        if (attempt < 3) timer = setTimeout(() => load(attempt + 1), 1000);
        else setError(e.message);
      }
    };
    load(0);
    return () => { active = false; clearTimeout(timer); };
  }, []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); } }, [toast]);
  const run = async (path, body, method) => {
    const epoch = authEpoch.current;
    const result = await api(path, body, method);
    if (epoch !== authEpoch.current) return result;
    await refresh();
    if (epoch === authEpoch.current) setToast(path.includes('feedback') ? 'Thank you. Your feedback is queued for review.' : 'Saved to your household.');
    return result;
  };
  const logout = async () => {
    setLoggingOut(true);
    try { await api('/auth/logout', {}); resetAccount(); }
    catch (e) { setError(e.message); } finally { setLoggingOut(false); }
  };
  const generate = async () => { setGenerating(true); setError(''); try { const result = await run('/recipes/generate', {}); if (!result.count) setToast('No matching plan yet. Check food dates, stock, and preferences.'); } catch (e) { setError(e.message); } finally { setGenerating(false); } };
  const navigate = v => { setView(v); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const nav = [{ id: 'overview', name: 'Overview', icon: LayoutDashboard }, { id: 'inventory', name: 'My inventory', icon: Package }, { id: 'meals', name: 'Meal ideas', icon: UtensilsCrossed }, { id: 'assistant', name: 'Cyan assistant', icon: Sparkles }];
  if (!state && authChecked) return <AuthScreen onAuthenticated={async () => {
    resetAccount(); setAuthChecked(false);
    try { await refresh(); } catch (e) { if (e.status !== 401) setError(e.message); }
  }} />;
  if (!state) return <div className="loading-screen"><div className="brand-mark"><Leaf size={30} /></div><h1>cyan<span>.</span></h1>{error ? <><p className="error" role="alert">{error}</p><Button onClick={() => { setError(''); refresh().catch(e => { if (e.status !== 401) setError(e.message); }); }}>Retry connection</Button><p>Start the server with npm run dev and check your .env configuration.</p></> : <><LoaderCircle className="spin" size={22} /><p>Opening your kitchen…</p></>}</div>;
  const initials = state.account.username.slice(0, 2).toUpperCase();
  return <div className="app-shell"><aside className="sidebar"><a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('overview'); }}><span className="brand-mark"><Leaf size={22} /></span>cyan<span className="brand-period">.</span></a><div className="household-switch"><div className="household-icon"><Users size={17} /></div><div><strong>{state.profile.household_name}</strong><small>{state.profile.household_size}-person household</small></div><button aria-label="Edit household" onClick={() => navigate('settings')}><ChevronDown size={15} /></button></div><div className="nav-label">YOUR EVERYDAY</div><nav>{nav.map(n => <button className={view === n.id ? 'nav-item active' : 'nav-item'} key={n.id} onClick={() => navigate(n.id)}><n.icon size={19} /><span>{n.name}</span>{n.id === 'assistant' && <span className="new-label">AI</span>}{n.id === 'inventory' && <small>{state.items.length}</small>}</button>)}</nav><div className="nav-divider" /><button className={`nav-item ${view === 'activity' ? 'active' : ''}`} onClick={() => navigate('activity')}><History size={19} />Activity & learning</button><button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings2 size={19} />Household settings</button><div className="sidebar-bottom"><div className="purpose-card"><div><Sprout size={23} /><span>A little less waste.<br />A little more good.</span></div><p>Make the most of what’s already at home.</p><span className="purpose-link">Made for everyday living <ArrowUpRight size={13} /></span></div><button className="profile-button" onClick={() => navigate('settings')}><span className="avatar">GH</span><span><strong>Your household</strong><small>Course prototype</small></span><Settings2 size={16} /></button></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb">My household <ChevronRight size={13} /><strong>{[...nav, { id: 'activity', name: 'Activity & learning' }, { id: 'settings', name: 'Household settings' }].find(n => n.id === view)?.name}</strong></div><div className="topbar-right"><div className="global-search"><Search size={16} /><input aria-label="Search your kitchen" placeholder="Search your kitchen" value={search} onChange={e => { setSearch(e.target.value); if (view !== 'inventory') navigate('inventory'); }} /><kbd>⌕</kbd></div><button className="notification-button" aria-label="Show food needing attention" onClick={() => setModal({ type: 'alerts' })}><Bell size={19} />{state.items.some(i => i.status !== 'In date') && <span />}</button><span className="header-divider" /><button className="avatar small" aria-label="Household settings" onClick={() => navigate('settings')}>GH</button></div></header>
    <main><div className="demo-top"><span className="dot" /><span>{state.demo ? 'Editable sample kitchen · stored in Neon' : 'Your personal kitchen'}</span><span className="connection-status"><span className="dot" />Neon connected <span className="demo-ai">{state.connection.ai ? 'Live AI' : 'AI demo mode'}</span></span></div>
      <div className="account-strip"><span className="avatar">{initials}</span><span className="account-name" title={state.account.username}>{state.account.username}</span><span className="account-separator">·</span><span className="account-caption">{state.demo ? 'Editable course sample data' : 'Your own inventory & preferences'}</span><button disabled={loggingOut} onClick={logout}><LogOut size={14} />{loggingOut ? 'Signing out…' : 'Sign out'}</button></div>
      {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}
      {view === 'overview' && <Overview state={state} setView={navigate} setModal={setModal} generate={generate} generating={generating} />}
      {view === 'inventory' && <Inventory state={state} setModal={setModal} search={search} setSearch={setSearch} />}
      {view === 'meals' && <Meals state={state} setModal={setModal} generate={generate} generating={generating} setView={navigate} />}
      {view === 'assistant' && <Assistant state={state} run={run} refresh={refresh} />}
      {view === 'settings' && <HouseholdSettings state={state} run={run} />}
      {view === 'activity' && <Activity state={state} run={run} />}
    </main><footer><span>© {new Date().getFullYear()} Cyan · Climbing Cat</span><span>Thoughtful kitchens. Less avoidable waste.</span><button onClick={() => navigate('activity')}><ShieldCheck size={13} />Human-led by design</button></footer></div>
    {modal?.type === 'add' && <AddModal state={state} onClose={() => setModal(null)} run={run} />}
    {modal?.type === 'edit' && <AddModal state={state} edit={modal.item} onClose={() => setModal(null)} run={run} />}
    {modal?.type === 'scan' && <ScanModal state={state} onClose={() => setModal(null)} run={run} />}
    {modal?.type === 'adjust' && <AdjustModal item={modal.item} onClose={() => setModal(null)} run={run} />}
    {modal?.type === 'recipe' && <RecipeModal recipe={modal.recipe} state={state} onClose={() => setModal(null)} run={run} />}
    {modal?.type === 'alerts' && <Modal title="A little attention goes a long way" subtitle="Food that needs using first or a package-label check." onClose={() => setModal(null)}>{state.items.filter(i => i.status !== 'In date').map(i => <button className="alert-item" key={i.id} onClick={() => setModal({ type: 'edit', item: i })}><span>{ICONS[i.category]}</span><div><strong>{i.name}</strong><small>{quantity(i.quantity)} {i.unit} · {i.location}</small></div><Badge status={i.status} /><ChevronRight size={16} /></button>)}{!state.items.some(i => i.status !== 'In date') && <p className="empty">No date reminders right now.</p>}<p className="info-line">These are in-app reminders. No messages are sent outside your household.</p></Modal>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);
