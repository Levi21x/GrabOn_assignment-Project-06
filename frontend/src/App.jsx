import { useState, useEffect, useCallback, useRef } from 'react'

const API_BASE = 'http://localhost:3002'

/* ============================================================
   GLOBAL STYLES INJECTION
   ============================================================ */
const GLOBAL_CSS = `
  @keyframes pathDraw { from{stroke-dashoffset:400;opacity:0} to{stroke-dashoffset:0;opacity:1} }
  @keyframes nodeAppear { from{transform:scale(0);opacity:0} to{transform:scale(1);opacity:1} }
  @keyframes hexPulseAnim { 0%,100%{opacity:.35} 50%{opacity:1} }
  @keyframes shimmerAnim { 0%{background-position:-200% center} 100%{background-position:200% center} }
  @keyframes blinkCursor { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  @keyframes raceBar { from{width:0%} }
  @keyframes raceIncrement {}
  @keyframes glowPulse { 0%,100%{text-shadow:0 0 8px rgba(0,212,255,.5)} 50%{text-shadow:0 0 22px rgba(0,212,255,1)} }
  @keyframes spinRing { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes flashCyan { 0%{background:#FFD700} 50%{background:#00D4FF;filter:brightness(1.5)} 100%{background:#00D4FF} }
  @keyframes stagger { from{opacity:0;transform:scale(.8) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }

  .path-anim { stroke-dasharray:400; animation: pathDraw .7s cubic-bezier(.16,1,.3,1) forwards; }
  .node-anim { animation: nodeAppear .4s cubic-bezier(.16,1,.3,1) forwards; }
  .hex-pending { animation: hexPulseAnim 2s ease-in-out infinite; }
  .hex-inflight { animation: hexPulseAnim .7s ease-in-out infinite; }
  .hex-retrying { animation: hexPulseAnim .4s ease-in-out infinite; }
  .hex-flash  { animation: flashCyan .6s ease-out forwards; }
  .shimmer-bg { background:linear-gradient(90deg,#1a1f35 25%,#252b45 50%,#1a1f35 75%);background-size:200% 100%;animation:shimmerAnim 1.5s infinite linear; }
  .blink-cur { animation: blinkCursor 1s step-end infinite; }
  .panel-enter { animation: slideUp .5s cubic-bezier(.16,1,.3,1) both; }
  .glow-cyan { animation: glowPulse 2.5s ease-in-out infinite; }
  .card-stagger { animation: stagger .4s cubic-bezier(.16,1,.3,1) both; }

  .hex-shape { clip-path: polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%); }

  .btn-accent {
    background: var(--accent,#FF6B35);
    transition: all .3s cubic-bezier(.16,1,.3,1);
  }
  .btn-accent:hover {
    transform: scale(1.03);
    box-shadow: 0 0 20px var(--accent-glow,rgba(255,107,53,.4));
  }

  .race-bar { transition: width 1.2s cubic-bezier(.16,1,.3,1); }

  .card-flip { perspective: 900px; }
  .card-flip-inner {
    position:relative; width:100%; height:100%;
    transform-style: preserve-3d;
    transition: transform .6s cubic-bezier(.16,1,.3,1);
  }
  .card-flip:hover .card-flip-inner { transform: rotateY(180deg); }
  .card-face { position:absolute; width:100%; height:100%; backface-visibility:hidden; -webkit-backface-visibility:hidden; }
  .card-face-back { transform: rotateY(180deg); }

  .lang-dissolve { transition: opacity .2s ease; }
`

/* ============================================================
   CONSTANTS
   ============================================================ */
const SAMPLE_DEALS = {
  zomato: {
    merchant_id:'zomato_001', merchant_name:'Zomato', category:'food',
    discount_value:50, discount_type:'percentage',
    expiry_timestamp: new Date(Date.now()+48*3600000).toISOString(),
    min_order_value:299, max_redemptions:10000, exclusive_flag:true
  },
  makemytrip: {
    merchant_id:'mmt_001', merchant_name:'MakeMyTrip', category:'travel',
    discount_value:1500, discount_type:'flat',
    expiry_timestamp: new Date(Date.now()+7*86400000).toISOString(),
    min_order_value:5000, max_redemptions:500, exclusive_flag:false
  },
  myntra: {
    merchant_id:'myntra_001', merchant_name:'Myntra', category:'fashion',
    discount_value:40, discount_type:'percentage',
    expiry_timestamp: new Date(Date.now()+24*3600000).toISOString(),
    min_order_value:0, max_redemptions:50000, exclusive_flag:false
  }
}

const CHANNELS = ['email','whatsapp','push','glance','payu_banner','instagram']
const STRATEGIES = ['urgency','value_highlight','social_proof']
const LANGUAGES = ['en','hi','te']
const CHANNEL_LABELS = {email:'Email',whatsapp:'WhatsApp',push:'Push Notification',glance:'Glance',payu_banner:'PayU Banner',instagram:'Instagram'}
const CHANNEL_SHORT = {email:'Email',whatsapp:'WhatsApp',push:'Push',glance:'Glance',payu_banner:'PayU',instagram:'Instagram'}
const STRATEGY_FULL = {urgency:'Urgency',value_highlight:'Value Highlight',social_proof:'Social Proof'}
const STRATEGY_SHORT = {urgency:'URG',value_highlight:'VAL',social_proof:'SOC'}
const LANG_FULL = {en:'English',hi:'हिंदी',te:'తెలుగు'}
const LANG_FLAGS = {en:'🇬🇧',hi:'🇮🇳',te:'🇮🇳'}
const CHAR_LIMITS = {'whatsapp.message':160,'push.title':50,'push.body':100,'glance.card_text':160,'payu_banner.banner_text':40}
const CH_COLOR = {email:'#3b82f6',whatsapp:'#22c55e',push:'#a855f7',glance:'#14b8a6',payu_banner:'#f97316',instagram:'#ec4899'}
const CH_BG = {email:'rgba(59,130,246,.1)',whatsapp:'rgba(34,197,94,.1)',push:'rgba(168,85,247,.1)',glance:'rgba(20,184,166,.1)',payu_banner:'rgba(249,115,22,.1)',instagram:'rgba(236,72,153,.1)'}

const MERCHANT_THEME = {
  zomato:{accent:'#E23744',glow:'rgba(226,55,68,.35)'},
  makemytrip:{accent:'#1A73E8',glow:'rgba(26,115,232,.35)'},
  myntra:{accent:'#FF3F6C',glow:'rgba(255,63,108,.35)'},
  default:{accent:'#FF6B35',glow:'rgba(255,107,53,.35)'}
}
const CAT_GRADIENT = {
  food:'linear-gradient(135deg,#f97316,#ef4444)',
  travel:'linear-gradient(135deg,#3b82f6,#06b6d4)',
  fashion:'linear-gradient(135deg,#ec4899,#8b5cf6)',
  electronics:'linear-gradient(135deg,#6366f1,#3b82f6)',
  health:'linear-gradient(135deg,#10b981,#06b6d4)',
  beauty:'linear-gradient(135deg,#f43f5e,#ec4899)',
  default:'linear-gradient(135deg,#FF6B35,#FF3366)'
}
const MOCK_CTR = {
  email:{urgency:4.2,value_highlight:3.1,social_proof:2.8},
  whatsapp:{urgency:8.7,value_highlight:6.4,social_proof:7.1},
  push:{urgency:5.3,value_highlight:4.9,social_proof:3.6},
  glance:{urgency:3.8,value_highlight:5.2,social_proof:4.1},
  payu_banner:{urgency:2.1,value_highlight:3.7,social_proof:2.4},
  instagram:{urgency:6.5,value_highlight:5.8,social_proof:7.9}
}
// 54 ordered slots
const ALL_SLOTS = []
for (const ch of CHANNELS) for (const st of STRATEGIES) for (const lg of LANGUAGES) ALL_SLOTS.push({channel:ch,strategy:st,language:lg})

/* ============================================================
   HOOKS
   ============================================================ */
function useTypewriter(text, speed=12, enabled=true) {
  const [shown, setShown] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!enabled||!text) { setShown(text||''); setDone(true); return }
    setShown(''); setDone(false)
    let i=0
    const id = setInterval(() => { i++; setShown(text.slice(0,i)); if(i>=text.length){clearInterval(id);setDone(true)} }, speed)
    return () => clearInterval(id)
  }, [text, speed, enabled])
  return {shown, done}
}

/* ============================================================
   UTILITIES
   ============================================================ */
function safeGet(obj, ...keys) {
  return keys.reduce((o,k)=>o&&o[k]!==undefined?o[k]:null, obj)
}

function getTheme(merchantName) {
  const key = (merchantName||'').toLowerCase().replace(/\s/g,'')
  return MERCHANT_THEME[key] || MERCHANT_THEME.default
}

function parseNaturalLanguage(text) {
  const r = {}
  const m1 = text.match(/\b(Zomato|MakeMyTrip|Myntra|Swiggy|Flipkart|Amazon|Meesho|Nykaa|Ola|Uber|Ajio)\b/i)
  if (m1) r.merchant_name = m1[1]
  const m2 = text.match(/(\d+)\s*(%|percent)/i)
  if (m2) { r.discount_value=parseInt(m2[1]); r.discount_type='percentage' }
  else { const m3=text.match(/(?:rs\.?|₹|inr)\s*(\d+)/i); if(m3){r.discount_value=parseInt(m3[1]);r.discount_type='flat'} }
  const m4 = text.match(/(?:above|over|min(?:imum)?)\s*[₹rs\.]*\s*(\d+)/i)
  if (m4) r.min_order_value=parseInt(m4[1])
  const cats={food:'food',restaurant:'food',pizza:'food',swiggy:'food',zomato:'food',travel:'travel',hotel:'travel',flight:'travel',fashion:'fashion',clothes:'fashion',cloth:'fashion',myntra:'fashion',electronics:'electronics',phone:'electronics',laptop:'electronics',health:'health',beauty:'beauty',nykaa:'beauty'}
  for (const [kw,cat] of Object.entries(cats)) { if(text.toLowerCase().includes(kw)){r.category=cat;break} }
  if (!r.category) r.category='food'
  if (text.match(/tonight|today/i)) r.expiry_timestamp=new Date(Date.now()+8*3600000).toISOString()
  else if (text.match(/tomorrow/i)) r.expiry_timestamp=new Date(Date.now()+24*3600000).toISOString()
  else if (text.match(/sunday/i)) { const d=new Date();d.setDate(d.getDate()+(7-d.getDay()||7));r.expiry_timestamp=d.toISOString() }
  const m5=text.match(/(\d+)\s*days?/i); if(m5) r.expiry_timestamp=new Date(Date.now()+parseInt(m5[1])*86400000).toISOString()
  if (!r.expiry_timestamp) r.expiry_timestamp=new Date(Date.now()+48*3600000).toISOString()
  return r
}

function formatRelative(ts) {
  if (!ts) return ''
  const diff = Date.now()-new Date(ts).getTime()
  if (diff<5000) return 'just now'
  if (diff<60000) return `${Math.floor(diff/1000)}s ago`
  if (diff<3600000) return `${Math.floor(diff/60000)}m ago`
  return `${Math.floor(diff/3600000)}h ago`
}

function exportDealPackage(variants, deal) {
  if (!variants||!deal) return
  const merchant = deal.merchant_name||'deal'
  const ts = new Date().toLocaleString('en-IN')
  let rows = ''
  for (const ch of CHANNELS) {
    rows += `<div class="ch-section"><h2>${CHANNEL_SHORT[ch]}</h2>`
    for (const st of STRATEGIES) for (const lg of LANGUAGES) {
      const v = safeGet(variants,ch,st,lg)
      if (!v) continue
      const text = typeof v==='object'?Object.entries(v).map(([k,val])=>`<b>${k}:</b> ${val}`).join('<br>'):`${v}`
      rows += `<div class="card"><div class="badges"><span class="badge-st">${STRATEGY_SHORT[st]}</span><span class="badge-lg">${LANG_FLAGS[lg]} ${LANG_FULL[lg]}</span></div><div class="text">${text}</div></div>`
    }
    rows += '</div>'
  }
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>GrabOn Deal Package — ${merchant}</title>
<style>body{font-family:system-ui,sans-serif;background:#fff;color:#1a1a1a;margin:0;padding:0}.header{background:#FF6B35;color:white;padding:24px 32px}.header h1{margin:0;font-size:28px}.header p{margin:4px 0 0;opacity:.8}.meta{background:#f5f5f5;padding:16px 32px;display:flex;gap:32px}.meta span{font-size:13px;color:#666}.meta b{color:#1a1a1a}.content{padding:24px 32px}.ch-section{margin-bottom:32px}.ch-section h2{font-size:18px;font-weight:700;border-bottom:2px solid #FF6B35;padding-bottom:8px;margin-bottom:16px}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}.card{background:#fafafa;border:1px solid #e5e5e5;border-radius:8px;padding:14px}.badges{display:flex;gap:6px;margin-bottom:8px}.badge-st,.badge-lg{font-size:10px;padding:2px 8px;border-radius:20px;font-weight:700}.badge-st{background:#FFF3E8;color:#FF6B35}.badge-lg{background:#E8F0FE;color:#1A73E8}.text{font-size:13px;line-height:1.6;color:#333}.footer{background:#f5f5f5;padding:16px 32px;text-align:center;font-size:12px;color:#999}</style></head>
<body><div class="header"><h1>GrabOn Deal Package</h1><p>${merchant} · Generated ${ts}</p></div>
<div class="meta"><span><b>Merchant:</b> ${merchant}</span><span><b>Deal ID:</b> ${deal.deal_id||'—'}</span><span><b>Channels:</b> 6</span><span><b>Variants:</b> 54</span></div>
<div class="content">${rows}</div>
<div class="footer">Generated by GrabOn Deal Distributor MCP | ${ts}</div></body></html>`
  const a=document.createElement('a')
  a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}))
  a.download=`grabon-deal-${merchant.toLowerCase().replace(/\s/g,'-')}-${Date.now()}.html`
  a.click()
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  const handle = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false),1500) }
  return (
    <button onClick={handle} title="Copy" style={{padding:'2px 6px',borderRadius:'4px',fontSize:'10px',background:copied?'rgba(0,212,255,.15)':'rgba(255,255,255,.05)',color:copied?'#00D4FF':'#64748b',border:`1px solid ${copied?'#00D4FF':'transparent'}`,cursor:'pointer',transition:'all .2s'}}>
      {copied?'✓ Copied':'📋'}
    </button>
  )
}

/* ============================================================
   FEATURE 8: TERMINAL COMMAND BAR
   ============================================================ */
function TerminalCommandBar({ onCommand, merchantName, mcpLive }) {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState([])
  const inputRef = useRef(null)
  useEffect(()=>{ inputRef.current?.focus() },[])
  const submit = () => {
    if (!input.trim()) return
    const parsed = parseNaturalLanguage(input)
    setHistory(h=>[input,...h].slice(0,3))
    onCommand(parsed, input)
    setInput('')
  }
  return (
    <div style={{background:'#0D1117',borderBottom:'1px solid #1a2238',padding:'10px 24px',fontFamily:"'JetBrains Mono',monospace"}}>
      {history.map((cmd,i)=>(
        <div key={i} style={{color:'#374151',fontSize:'11px',opacity:1-(i*.28),lineHeight:'1.5'}}>
          <span style={{color:'#166534'}}>$ </span><span>{cmd}</span>
        </div>
      ))}
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginTop: history.length?'6px':'0'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',flex:1}}>
          <span style={{color:'#FF6B35',fontWeight:700,fontSize:'16px',lineHeight:1}}>›</span>
          <input ref={inputRef} type="text" value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') submit() }}
            placeholder='Distribute a deal in natural language... (e.g. "Zomato 50% off above ₹299, expires Sunday")'
            style={{flex:1,background:'transparent',border:'none',outline:'none',color:'#E2E8F0',fontSize:'13px',fontFamily:"'JetBrains Mono',monospace",caretColor:'#FF6B35'}}
          />
          <span className="blink-cur" style={{color:'#FF6B35',fontWeight:700,fontSize:'16px'}}>█</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px',flexShrink:0}}>
          {merchantName && <span style={{color:'var(--accent,#FF6B35)',fontSize:'11px',letterSpacing:'.04em'}}>[ {merchantName.toUpperCase()} ]</span>}
          {/* MCP LIVE — WebSocket connection status */}
          <div style={{display:'flex',alignItems:'center',gap:'5px',background:mcpLive?'rgba(0,255,136,.1)':'rgba(100,116,139,.07)',border:`1px solid ${mcpLive?'rgba(0,255,136,.35)':'rgba(100,116,139,.25)'}`,borderRadius:'4px',padding:'3px 9px',transition:'all .4s'}}>
            <div style={{width:'6px',height:'6px',background:mcpLive?'#00FF88':'#374151',borderRadius:'50%',animation:mcpLive?'hexPulseAnim .8s ease-in-out infinite':'none',transition:'background .4s'}}/>
            <span style={{color:mcpLive?'#00FF88':'#374151',fontSize:'10px',fontWeight:700,letterSpacing:'.06em',transition:'color .4s'}}>MCP LIVE</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'5px',background:'rgba(0,255,136,.08)',border:'1px solid rgba(0,255,136,.25)',borderRadius:'4px',padding:'3px 9px'}}>
            <div style={{width:'6px',height:'6px',background:'#00FF88',borderRadius:'50%',animation:'hexPulseAnim 2s ease-in-out infinite'}}/>
            <span style={{color:'#00FF88',fontSize:'10px',fontWeight:700,letterSpacing:'.06em'}}>MCP CONNECTED</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   FEATURE 1: DEAL DNA NETWORK VISUALIZER
   ============================================================ */
const DNA_CH_Y = {email:50,whatsapp:142,push:234,glance:326,payu_banner:418,instagram:510}
const DNA_INPUT = {x:60,y:280}

function DealDNAVisualizer({ isProcessing, isComplete, processingKey }) {
  const [phase, setPhase] = useState(0)
  const [lit, setLit] = useState([])

  useEffect(() => {
    if (!isProcessing) { setPhase(0); setLit([]); return }
    setPhase(1)
    const t1 = setTimeout(()=>setPhase(2), 500)
    const t2 = setTimeout(()=>{
      setPhase(3)
      CHANNELS.forEach((ch,i)=>setTimeout(()=>setLit(prev=>[...prev,ch]),i*220))
    },900)
    return ()=>{ clearTimeout(t1); clearTimeout(t2) }
  },[processingKey, isProcessing])

  useEffect(()=>{ if(isComplete) setPhase(4) },[isComplete])

  const inp = DNA_INPUT
  const empty = phase===0

  return (
    <div style={{background:'#111827',border:'1px solid #1e2a45',borderRadius:'12px',padding:'16px',height:'100%',minHeight:'380px',display:'flex',flexDirection:'column'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px',flexShrink:0}}>
        <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'12px',letterSpacing:'.1em',color:'#94a3b8'}}>DEAL DNA NETWORK</span>
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',color: phase>=4?'#00D4FF':phase>=1?'#FF6B35':'#374151'}}>
          {phase>=4?'✓ 54/54 ACTIVATED':phase>=1?'● DISTRIBUTING...':'○ IDLE'}
        </span>
      </div>
      <svg key={processingKey} viewBox="0 0 460 575" style={{flex:1,width:'100%',maxHeight:'500px'}}>
        <defs>
          <filter id="glow-filter">
            <feGaussianBlur stdDeviation="2.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <pattern id="dot-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="#1a2238"/>
          </pattern>
        </defs>
        <rect width="460" height="575" fill="url(#dot-grid)"/>

        {/* Ghost state */}
        {empty && CHANNELS.map(ch=>(
          <g key={ch} opacity=".12">
            <line x1={inp.x+14} y1={inp.y} x2={186} y2={DNA_CH_Y[ch]} stroke="#4a5568" strokeWidth="1" strokeDasharray="5,5"/>
            <circle cx={194} cy={DNA_CH_Y[ch]} r="11" fill="none" stroke="#4a5568" strokeWidth="1"/>
          </g>
        ))}
        {empty && (
          <>
            <circle cx={inp.x} cy={inp.y} r="16" fill="none" stroke="#374151" strokeWidth="1.5" opacity=".3"/>
            <text x={230} y={575/2} textAnchor="middle" fill="#374151" fontSize="11" fontFamily="JetBrains Mono">Submit a deal to begin distribution</text>
          </>
        )}

        {/* Input node */}
        {phase>=1 && (
          <g filter="url(#glow-filter)" className="node-anim">
            <circle cx={inp.x} cy={inp.y} r="22" fill="var(--accent,#FF6B35)" opacity=".12"/>
            <circle cx={inp.x} cy={inp.y} r="15" fill="var(--accent,#FF6B35)"/>
            <text x={inp.x} y={inp.y-19} textAnchor="middle" fill="var(--accent,#FF6B35)" fontSize="8" fontFamily="JetBrains Mono" fontWeight="700">DEAL INPUT</text>
            {phase>=2 && <circle cx={inp.x} cy={inp.y} r="24" fill="none" stroke="var(--accent,#FF6B35)" strokeWidth="1" opacity=".4" className="hex-pending"/>}
          </g>
        )}

        {/* Channels */}
        {phase>=2 && CHANNELS.map((ch,i)=>{
          const cy=DNA_CH_Y[ch]
          const isLit=lit.includes(ch)
          const col=CH_COLOR[ch]
          const delay=`${i*.18}s`
          const mx=(inp.x+194)/2
          return (
            <g key={ch}>
              <path
                d={`M ${inp.x+15} ${inp.y} C ${mx} ${inp.y},${mx} ${cy},${180} ${cy}`}
                fill="none" stroke={col} strokeWidth="1.8" opacity=".85"
                className="path-anim" style={{animationDelay:delay,opacity:0}}
              />
              {isLit && (
                <g filter="url(#glow-filter)" className="node-anim">
                  <circle cx={194} cy={cy} r="18" fill={col} opacity=".15"/>
                  <circle cx={194} cy={cy} r="12" fill={col}/>
                  <text x={194} y={cy+3.5} textAnchor="middle" fill="white" fontSize="7" fontFamily="JetBrains Mono" fontWeight="700">
                    {CHANNEL_SHORT[ch].slice(0,3).toUpperCase()}
                  </text>
                  <text x={194} cy={cy-16} textAnchor="middle" fill={col} fontSize="7.5" fontFamily="JetBrains Mono" y={cy-16}>{CHANNEL_SHORT[ch]}</text>
                </g>
              )}
              {isLit && LANGUAGES.map((lg,li)=>{
                const ly = cy - 22 + li*22
                const lDelay=`${(i*.18+.3+li*.06)}s`
                return (
                  <g key={lg}>
                    <line x1={206} y1={cy} x2={355} y2={ly} stroke={col} strokeWidth="1.2" opacity=".5"
                      className="path-anim" style={{animationDelay:lDelay,opacity:0}}/>
                    <g className="node-anim" style={{animationDelay:lDelay,opacity:0}}>
                      <circle cx={363} cy={ly} r="11" fill={col} opacity=".18"/>
                      <circle cx={363} cy={ly} r="7" fill={col}/>
                      <text x={363} y={ly+3} textAnchor="middle" fontSize="8">{lg==='en'?'🇬🇧':'🇮🇳'}</text>
                    </g>
                  </g>
                )
              })}
            </g>
          )
        })}

        {/* Column labels */}
        {phase>=3 && <>
          <text x={194} y={20} textAnchor="middle" fill="#475569" fontSize="8" fontFamily="JetBrains Mono">CHANNELS</text>
          <text x={363} y={20} textAnchor="middle" fill="#475569" fontSize="8" fontFamily="JetBrains Mono">LANGUAGES</text>
        </>}

        {/* Complete border flash */}
        {phase>=4 && <rect x="2" y="2" width="456" height="571" rx="8" fill="none" stroke="#00D4FF" strokeWidth="2" opacity=".4" className="hex-flash"/>}

        {/* Watermark */}
        <text x={230} y={300} textAnchor="middle" fill="#0f172a" fontSize="80" fontFamily="Syne" fontWeight="800" style={{userSelect:'none'}}>54</text>
      </svg>
    </div>
  )
}

/* ============================================================
   FEATURE 3: DEVICE MOCKUP PREVIEWS
   ============================================================ */

// Merchant brand identity for email mockup
const EMAIL_MERCHANT_THEMES = {
  zomato:      { color:'#E23744', dark:'#6b0f19', label:'Zomato',      emoji:'🍔', tagline:'Food Delivery' },
  swiggy:      { color:'#FC8019', dark:'#7c3c08', label:'Swiggy',      emoji:'🛵', tagline:'Food Delivery' },
  blinkit:     { color:'#F1C40F', dark:'#7a5e00', label:'Blinkit',     emoji:'⚡', tagline:'Quick Commerce' },
  makemytrip:  { color:'#1A73E8', dark:'#0a2d6b', label:'MakeMyTrip',  emoji:'✈️', tagline:'Travel & Hotels' },
  goibibo:     { color:'#E8472C', dark:'#6b1810', label:'GoIbibo',     emoji:'🏨', tagline:'Travel Booking' },
  cleartrip:   { color:'#0057B8', dark:'#002d60', label:'Cleartrip',   emoji:'✈️', tagline:'Flights & Hotels' },
  myntra:      { color:'#FF3F6C', dark:'#7a0030', label:'Myntra',      emoji:'👗', tagline:'Fashion' },
  ajio:        { color:'#6A1B9A', dark:'#3a0060', label:'AJIO',        emoji:'👔', tagline:'Fashion' },
  amazon:      { color:'#FF9900', dark:'#7a4900', label:'Amazon',      emoji:'📦', tagline:'Shopping' },
  flipkart:    { color:'#2874F0', dark:'#0d3a80', label:'Flipkart',    emoji:'🛒', tagline:'Shopping' },
  nykaa:       { color:'#FC4091', dark:'#701a43', label:'Nykaa',       emoji:'💄', tagline:'Beauty' },
  meesho:      { color:'#9C27B0', dark:'#4a0060', label:'Meesho',      emoji:'🛍️', tagline:'Shopping' },
  bigbasket:   { color:'#84BF41', dark:'#2d5210', label:'BigBasket',   emoji:'🥦', tagline:'Groceries' },
}
const EMAIL_CAT_THEMES = {
  food:        { color:'#E23744', dark:'#6b0f19', emoji:'🍔', tagline:'Food & Dining' },
  travel:      { color:'#1A73E8', dark:'#0a2d6b', emoji:'✈️', tagline:'Travel & Hotels' },
  fashion:     { color:'#FF3F6C', dark:'#7a0030', emoji:'👗', tagline:'Fashion & Style' },
  beauty:      { color:'#FC4091', dark:'#701a43', emoji:'💄', tagline:'Beauty & Wellness' },
  electronics: { color:'#2874F0', dark:'#0d3a80', emoji:'📱', tagline:'Electronics' },
  groceries:   { color:'#16a34a', dark:'#14532d', emoji:'🛒', tagline:'Groceries' },
  health:      { color:'#0891b2', dark:'#083344', emoji:'💊', tagline:'Health & Wellness' },
}
function getMerchantEmailTheme(merchantName, category) {
  const m = (merchantName||'').toLowerCase().replace(/[\s\W]+/g,'')
  for (const [key, theme] of Object.entries(EMAIL_MERCHANT_THEMES)) {
    if (m.includes(key)) return { ...theme, label: merchantName }
  }
  const ct = EMAIL_CAT_THEMES[category]
  if (ct) return { ...ct, label: merchantName }
  return { color:'#FF6B35', dark:'#7c3010', label: merchantName||'GrabOn', emoji:'🎁', tagline:'Exclusive Deal' }
}

// Variant-specific email content factories
function buildEmailContent(strategy, data, merchant, category, dealMeta){
  const subject   = safeGet(data,'subject')  || `Exclusive deal from ${merchant||'GrabOn'}`
  const headline  = safeGet(data,'headline') || safeGet(data,'body') || `Big savings at ${merchant||'GrabOn'}`
  const body      = safeGet(data,'body')     || null
  const cta       = safeGet(data,'cta')      || 'Claim Now'

  const mt = getMerchantEmailTheme(merchant, category)

  // Real deal meta
  const discVal   = dealMeta?.discount_value
  const discType  = dealMeta?.discount_type
  const discStr   = discVal ? (discType==='percentage' ? `${discVal}%` : discType==='flat' ? `₹${discVal}` : 'special') : null
  const maxRed    = dealMeta?.max_redemptions ? Number(dealMeta.max_redemptions).toLocaleString('en-IN') : '10,000'
  const minOrder  = dealMeta?.min_order_value ? `₹${dealMeta.min_order_value}` : null
  const expiryTs  = dealMeta?.expiry_timestamp ? new Date(dealMeta.expiry_timestamp) : null
  const hoursLeft = expiryTs ? Math.max(1, Math.round((expiryTs-Date.now())/(1000*60*60))) : null
  const expiryStr = hoursLeft ? (hoursLeft<=24 ? `${hoursLeft} hrs` : hoursLeft<=72 ? `${Math.ceil(hoursLeft/24)} days` : 'limited time') : 'limited time'

  // Supporting body copy: prefer API-generated (split by '. '), else compose
  const bodyLines = body
    ? body.split('. ').filter(s=>s.trim().length>10).map(s=>s.trim().replace(/\.?$/, '.'))
    : null

  if (strategy==='urgency') {
    const scarcityLine = discStr
      ? `⚡ ${expiryStr} left — use this ${discStr} ${merchant} deal before it's gone.`
      : `⚡ Time is running out — this deal disappears before you know it.`
    return {
      subject,
      badgeLabel: '⏰ LIMITED TIME',
      badgeColor: '#ef4444',
      heroBg:     `linear-gradient(135deg,${mt.dark},${mt.color}cc,#991b1b)`,
      heroAccent: '#fca5a5',
      displayHeadline: headline,
      merchantTheme: mt,
      pill: { text:`🔥 Only ${maxRed} uses remaining`, bg:'rgba(239,68,68,.2)', color:'#fca5a5', border:'rgba(239,68,68,.35)' },
      supporting: bodyLines || [
        `Your window is closing fast — this ${merchant} deal disappears in ${expiryStr}.`,
        `Only ${maxRed} redemptions left. Thousands are already saving right now.`,
        `No codes needed. Just click and save${minOrder ? ` on orders above ${minOrder}` : ''}.`,
      ],
      savingsCallout: { label:'⚡ SCARCITY ALERT', value:`Only ${maxRed} left`, bg:'rgba(239,68,68,.15)', border:'rgba(239,68,68,.4)', color:'#fca5a5' },
      preCtaLine: `🕐 ${expiryStr} remaining — don't wait.`,
      cta,
      ctaBg:   'linear-gradient(90deg,#dc2626,#b91c1c)',
      footerNote: `⚠ Offer expires in ${expiryStr}. Only ${maxRed} redemptions.`,
      urgencyBar: true,
    }
  }
  if (strategy==='value_highlight') {
    const saveVal = discStr || 'big'
    return {
      subject,
      badgeLabel: '💰 BEST VALUE',
      badgeColor: '#16a34a',
      heroBg:     `linear-gradient(135deg,${mt.dark},#14532d,#15803d)`,
      heroAccent: '#4ade80',
      displayHeadline: headline,
      merchantTheme: mt,
      pill: { text:'✓ Maximum savings · No hidden charges', bg:'rgba(74,222,128,.15)', color:'#86efac', border:'rgba(74,222,128,.3)' },
      supporting: bodyLines || [
        `Smart shoppers at ${merchant} know: this ${saveVal} deal is the best price you'll find anywhere.`,
        `${minOrder ? `Spend above ${minOrder} and the savings kick in automatically.` : 'Savings apply automatically at checkout.'}`,
        `No coupon hunting, no fine print — just pure value on every ${category} order.`,
      ],
      savingsCallout: { label:'YOU SAVE', value: discStr || 'BIG', bg:'rgba(74,222,128,.12)', border:'rgba(74,222,128,.4)', color:'#4ade80' },
      preCtaLine: `✅ Best price on GrabOn · Verified savings`,
      cta,
      ctaBg:   'linear-gradient(90deg,#16a34a,#15803d)',
      footerNote: '✓ Best price guarantee · No hidden charges · Easy cancellation.',
      urgencyBar: false,
    }
  }
  // social_proof
  return {
    subject,
    badgeLabel: '⭐ TRENDING NOW',
    badgeColor: '#7c3aed',
    heroBg:     `linear-gradient(135deg,${mt.dark},#2e1065,#4c1d95)`,
    heroAccent: '#a78bfa',
    displayHeadline: headline,
    merchantTheme: mt,
    pill: { text:`🏆 #1 ${category} deal this week on GrabOn`, bg:'rgba(167,139,250,.15)', color:'#c4b5fd', border:'rgba(167,139,250,.3)' },
    supporting: bodyLines || [
      `${maxRed} people have already saved ${discStr||'big'} at ${merchant} on GrabOn today.`,
      `Rated ★★★★½ · The most-loved ${category} deal this month.`,
      `When this many shoppers agree, it's not FOMO — it's just smart.`,
    ],
    savingsCallout: { label:'👥 SOCIAL PROOF', value:`${maxRed} users saved today`, bg:'rgba(167,139,250,.12)', border:'rgba(167,139,250,.35)', color:'#a78bfa' },
    preCtaLine: `★★★★½ · Verified by ${maxRed} GrabOn members`,
    cta,
    ctaBg:   'linear-gradient(90deg,#7c3aed,#6d28d9)',
    footerNote: `🏆 Top-rated deal · ${maxRed} redemptions · Verified by GrabOn`,
    urgencyBar: false,
  }
}

function EmailMockup({ data, merchant, category, strategy, dealMeta, isTyping }) {
  const strat = strategy || 'urgency'
  const ec    = buildEmailContent(strat, data, merchant, category, dealMeta)
  const mt    = ec.merchantTheme
  const { shown: shownHL, done: hlDone } = useTypewriter(ec.displayHeadline, 10, isTyping)
  const { shown: shownSub }              = useTypewriter(ec.subject, 8, isTyping)
  const [typedBody, setTypedBody]        = useState('')
  const [bodyDone, setBodyDone]          = useState(false)
  const fullBody = ec.supporting.join(' ')

  useEffect(()=>{
    setTypedBody(''); setBodyDone(false)
    if (!isTyping){ setTypedBody(fullBody); setBodyDone(true); return }
    const wait = setTimeout(()=>{
      let i = 0
      const id = setInterval(()=>{ i++; setTypedBody(fullBody.slice(0,i)); if(i>=fullBody.length){clearInterval(id);setBodyDone(true)} },7)
      return ()=>clearInterval(id)
    }, (ec.displayHeadline.length*10)+400)
    return ()=>{ clearTimeout(wait) }
  },[isTyping, strat, fullBody, ec.displayHeadline])

  return (
    <div style={{background:'#1c1c1e',borderRadius:'10px',overflow:'hidden',border:'1px solid #2d2d2d',fontFamily:'system-ui',boxShadow:'0 4px 24px rgba(0,0,0,.5)'}}>
      {/* Gmail chrome bar */}
      <div style={{background:'#111',padding:'8px 12px',display:'flex',alignItems:'center',gap:'8px',borderBottom:'1px solid #2a2a2a',flexShrink:0}}>
        <div style={{display:'flex',gap:'4px'}}>{['#ff5f57','#ffbd2e','#28c840'].map((c,i)=><div key={i} style={{width:'9px',height:'9px',borderRadius:'50%',background:c}}/>)}</div>
        <span style={{color:'#6b7280',fontSize:'11px',marginLeft:'4px',fontFamily:"'JetBrains Mono',monospace"}}>deals@grabon.in — via {merchant||'GrabOn'}</span>
      </div>

      {/* Scrollable email body */}
      <div style={{maxHeight:'560px',overflowY:'auto'}}>

        {/* Email meta row */}
        <div style={{background:'#161616',padding:'10px 16px',borderBottom:'1px solid #222',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <div style={{width:'34px',height:'34px',borderRadius:'50%',background:mt.color,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,color:'white',fontSize:'16px',flexShrink:0}}>{mt.emoji}</div>
            <div>
              <div style={{color:'#e5e7eb',fontSize:'12px',fontWeight:700}}>GrabOn × {mt.label}</div>
              <div style={{color:'#6b7280',fontSize:'10px',fontFamily:"'JetBrains Mono',monospace"}}>deals@grabon.in</div>
            </div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{color:'#6b7280',fontSize:'10px',fontFamily:"'JetBrains Mono',monospace"}}>just now</div>
            <div style={{padding:'2px 8px',background:`${ec.badgeColor}22`,border:`1px solid ${ec.badgeColor}55`,borderRadius:'20px',fontSize:'9px',fontWeight:700,color:ec.badgeColor,marginTop:'3px',letterSpacing:'.05em'}}>{ec.badgeLabel}</div>
          </div>
        </div>

        {/* Subject line */}
        <div style={{background:'#131313',padding:'10px 16px',borderBottom:'1px solid #1e1e1e'}}>
          <div style={{color:'#94a3b8',fontSize:'10px',marginBottom:'3px',textTransform:'uppercase',letterSpacing:'.06em'}}>Subject</div>
          <div style={{color:'#e5e7eb',fontSize:'13px',fontWeight:600,lineHeight:1.4}}>
            {isTyping ? shownSub : ec.subject}{isTyping&&!shownSub?<span className="blink-cur">|</span>:null}
          </div>
        </div>

        {/* Merchant + GrabOn co-brand header */}
        <div style={{background:mt.color,padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <span style={{fontSize:'20px'}}>{mt.emoji}</span>
            <div>
              <span style={{color:'white',fontWeight:900,fontSize:'15px',fontFamily:"'Syne',sans-serif"}}>{mt.label}</span>
              <span style={{color:'rgba(255,255,255,.55)',fontSize:'11px',marginLeft:'6px'}}>{mt.tagline}</span>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
            <span style={{color:'rgba(255,255,255,.5)',fontSize:'10px'}}>via</span>
            <div style={{background:'white',borderRadius:'4px',padding:'2px 8px'}}>
              <span style={{color:'#FF6B35',fontWeight:900,fontSize:'11px',fontFamily:"'Syne',sans-serif"}}>GrabOn</span>
            </div>
          </div>
        </div>

        {/* Hero section */}
        <div style={{background:ec.heroBg,padding:'28px 20px 22px',textAlign:'center',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',inset:0,backgroundImage:'radial-gradient(circle at 80% 20%,rgba(255,255,255,.07) 0%,transparent 55%)',pointerEvents:'none'}}/>

          {/* Urgency bar */}
          {ec.urgencyBar&&(
            <div style={{background:'rgba(239,68,68,.25)',border:'1px solid rgba(239,68,68,.45)',borderRadius:'6px',padding:'6px 14px',marginBottom:'14px',display:'inline-flex',alignItems:'center',gap:'8px'}}>
              <div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#ef4444',animation:'hexPulseAnim .7s ease-in-out infinite'}}/>
              <span style={{color:'#fca5a5',fontSize:'11px',fontWeight:700,fontFamily:"'JetBrains Mono',monospace",letterSpacing:'.04em'}}>
                🕐 DEAL EXPIRES IN {dealMeta?.expiry_timestamp
                  ? (() => { const h=Math.max(1,Math.round((new Date(dealMeta.expiry_timestamp)-Date.now())/(1000*60*60))); return h<=24?`${h} HOURS`:`${Math.ceil(h/24)} DAYS` })()
                  : '< 12 HOURS'}
              </span>
            </div>
          )}

          {/* Big headline — minimum 28px */}
          <h1 style={{color:'white',fontSize:'30px',fontWeight:900,lineHeight:1.15,margin:'0 0 14px',fontFamily:"'Syne',sans-serif",textShadow:`0 2px 16px rgba(0,0,0,.5)`,letterSpacing:'-.01em'}}>
            {isTyping ? shownHL : ec.displayHeadline}{isTyping&&!hlDone?<span className="blink-cur" style={{color:ec.heroAccent}}>|</span>:null}
          </h1>

          {/* Pill badge */}
          <div>
            <span style={{display:'inline-block',background:ec.pill.bg,border:`1px solid ${ec.pill.border}`,color:ec.pill.color,fontSize:'11px',fontWeight:700,padding:'5px 14px',borderRadius:'20px'}}>{ec.pill.text}</span>
          </div>
        </div>

        {/* Body + callout + CTA */}
        <div style={{background:'#1a1a1a',padding:'20px'}}>

          {/* Claude-generated body copy */}
          <div style={{marginBottom:'16px'}}>
            {ec.supporting.map((line,i)=>(
              <p key={i} style={{color:i===0?'#e5e7eb':'#9ca3af',fontSize:i===0?'14px':'13px',lineHeight:1.7,margin:'0 0 8px',fontWeight:i===0?500:400}}>
                {isTyping
                  ? (()=>{ const s=ec.supporting.slice(0,i).join(' ').length+(i?1:0); const e=s+line.length; return typedBody.length>s?typedBody.slice(s,Math.min(typedBody.length,e)):'' })()
                  : line
                }{isTyping&&!bodyDone&&(()=>{const s=ec.supporting.slice(0,i).join(' ').length+(i?1:0);const e=s+line.length;return typedBody.length>=s&&typedBody.length<e?<span className="blink-cur">|</span>:null})()}
              </p>
            ))}
          </div>

          {/* Savings / social callout box */}
          <div style={{background:ec.savingsCallout.bg,border:`1.5px solid ${ec.savingsCallout.border}`,borderRadius:'8px',padding:'12px 16px',marginBottom:'16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <div style={{color:ec.savingsCallout.color,fontSize:'10px',fontWeight:700,letterSpacing:'.08em',marginBottom:'3px'}}>{ec.savingsCallout.label}</div>
              <div style={{color:'white',fontSize:'20px',fontWeight:900,fontFamily:"'Syne',sans-serif"}}>{ec.savingsCallout.value}</div>
            </div>
            <div style={{fontSize:'28px'}}>{mt.emoji}</div>
          </div>

          {/* Divider */}
          <div style={{height:'1px',background:'linear-gradient(90deg,transparent,#2d2d2d,transparent)',margin:'14px 0'}}/>

          {/* Pre-CTA variant-specific line */}
          <div style={{textAlign:'center',color:ec.heroAccent,fontSize:'12px',fontWeight:700,letterSpacing:'.03em',marginBottom:'12px',fontFamily:"'JetBrains Mono',monospace"}}>
            {ec.preCtaLine}
          </div>

          {/* Full-width CTA */}
          <button style={{display:'block',width:'100%',padding:'16px',background:ec.ctaBg,color:'white',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:900,cursor:'pointer',letterSpacing:'.05em',fontFamily:"'Syne',sans-serif",boxShadow:`0 4px 20px ${ec.badgeColor}55`,transition:'transform .15s'}}>
            {ec.cta} →
          </button>

          {/* Trust row */}
          <div style={{display:'flex',justifyContent:'center',gap:'16px',marginTop:'12px',flexWrap:'wrap'}}>
            {['🔒 100% Secure','✓ No spam ever','💯 Easy opt-out'].map((t,i)=>(
              <span key={i} style={{color:'#374151',fontSize:'10px'}}>{t}</span>
            ))}
          </div>
        </div>

        {/* Email footer */}
        <div style={{background:'#111',padding:'14px 20px',borderTop:'1px solid #1e1e1e',textAlign:'center'}}>
          <div style={{color:'#374151',fontSize:'10px',lineHeight:1.8,fontFamily:"'JetBrains Mono',monospace"}}>
            <div style={{color:ec.badgeColor,fontSize:'11px',fontWeight:700,marginBottom:'6px'}}>{ec.footerNote}</div>
            {dealMeta?.min_order_value && <div>Min order: ₹{dealMeta.min_order_value} · </div>}
            <div>Exclusive for GrabOn members · Max {dealMeta?.max_redemptions ? Number(dealMeta.max_redemptions).toLocaleString('en-IN') : 'limited'} redemptions · Subject to availability</div>
            <div style={{marginTop:'6px',color:'#1f2937'}}>© 2026 GrabOn · <span style={{textDecoration:'underline',cursor:'pointer'}}>Unsubscribe</span> · <span style={{textDecoration:'underline',cursor:'pointer'}}>View in browser</span></div>
          </div>
        </div>

      </div>
    </div>
  )
}

function WhatsAppMockup({ data, isTyping }) {
  const message = safeGet(data,'message') || 'Check out this amazing offer!'
  const charLimit = 160
  const over = message.length > charLimit
  const { shown, done } = useTypewriter(message, 8, isTyping)
  return (
    <div style={{background:'#0b141a',borderRadius:'10px',overflow:'hidden',border:'1px solid #1f2c34',fontFamily:'system-ui',boxShadow:'0 4px 24px rgba(0,0,0,.4)'}}>
      {/* WhatsApp header */}
      <div style={{background:'#1f2c34',padding:'10px 14px',display:'flex',alignItems:'center',gap:'10px',borderBottom:'1px solid #2a3942'}}>
        <div style={{width:'34px',height:'34px',borderRadius:'50%',background:'linear-gradient(135deg,#FF6B35,#FF3366)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,color:'white',fontSize:'14px'}}>G</div>
        <div style={{flex:1}}>
          <div style={{color:'#e9edef',fontWeight:600,fontSize:'13px'}}>GrabOn Deals</div>
          <div style={{color:'#8696a0',fontSize:'11px'}}>online</div>
        </div>
        <div style={{color:'#8696a0',fontSize:'16px'}}>⋮</div>
      </div>
      {/* Chat area */}
      <div style={{padding:'16px',background:'#0b141a',backgroundImage:'radial-gradient(ellipse at 50% 50%,rgba(0,168,132,.04) 0%,transparent 70%)'}}>
        <div style={{display:'flex',justifyContent:'flex-end'}}>
          <div style={{maxWidth:'280px',background:'#005c4b',borderRadius:'8px 0 8px 8px',padding:'8px 10px',position:'relative'}}>
            <p style={{color:'#e9edef',fontSize:'13px',lineHeight:1.5,margin:0}}>
              {isTyping ? shown : message}{isTyping&&!done?<span className="blink-cur">|</span>:null}
            </p>
            <div style={{textAlign:'right',marginTop:'4px',display:'flex',justifyContent:'flex-end',alignItems:'center',gap:'4px'}}>
              <span style={{color:'rgba(233,237,239,.5)',fontSize:'10px'}}>just now</span>
              <span style={{color:'#53bdeb',fontSize:'11px'}}>✓✓</span>
            </div>
          </div>
        </div>
        <div style={{marginTop:'8px',display:'flex',alignItems:'center',gap:'6px'}}>
          <span style={{fontSize:'10px',color: over?'#ef4444':'#6b7280', fontFamily:"'JetBrains Mono',monospace"}}>{message.length}/{charLimit}</span>
          {over && <span style={{fontSize:'10px',color:'#ef4444',fontWeight:700}}>⚠ OVER LIMIT</span>}
        </div>
      </div>
    </div>
  )
}

function PushMockup({ data, isTyping }) {
  const title = safeGet(data,'title') || 'GrabOn Deal Alert'
  const body = safeGet(data,'body') || 'Tap to claim your exclusive offer'
  const titleOver = title.length > 50
  const bodyOver = body.length > 100
  const { shown: shownTitle, done: titleDone } = useTypewriter(title, 10, isTyping)
  const { shown: shownBody } = useTypewriter(body, 8, isTyping)
  return (
    <div style={{background:'#1c1c1e',borderRadius:'12px',overflow:'hidden',border:'1px solid #2d2d2d',fontFamily:'system-ui',boxShadow:'0 4px 24px rgba(0,0,0,.4)'}}>
      {/* Status bar */}
      <div style={{background:'#0a0a0a',padding:'6px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{color:'#9ca3af',fontSize:'10px',fontFamily:"'JetBrains Mono',monospace"}}>12:47</span>
        <div style={{display:'flex',gap:'4px',alignItems:'center'}}>
          <span style={{color:'#9ca3af',fontSize:'9px'}}>▲▲▲</span>
          <span style={{color:'#9ca3af',fontSize:'9px'}}>WiFi</span>
          <span style={{color:'#9ca3af',fontSize:'10px'}}>🔋</span>
        </div>
      </div>
      {/* Notification card */}
      <div style={{margin:'12px',background:'rgba(255,255,255,.06)',borderRadius:'14px',overflow:'hidden',backdropFilter:'blur(20px)'}}>
        <div style={{padding:'12px 14px'}}>
          <div style={{display:'flex',alignItems:'flex-start',gap:'10px'}}>
            <div style={{width:'36px',height:'36px',borderRadius:'8px',background:'var(--accent,#FF6B35)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,color:'white',fontSize:'16px',flexShrink:0}}>G</div>
            <div style={{flex:1}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'3px'}}>
                <span style={{color:'#9ca3af',fontSize:'10px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.04em'}}>GrabOn · now</span>
              </div>
              <div style={{color:'#f3f4f6',fontWeight:700,fontSize:'14px',lineHeight:1.3,marginBottom:'3px'}}>
                {isTyping?shownTitle:title}{isTyping&&!titleDone?<span className="blink-cur">|</span>:null}
                {titleOver&&<span style={{color:'#ef4444',fontSize:'10px',marginLeft:'4px'}}>⚠ {title.length}/50</span>}
              </div>
              <div style={{color:'#9ca3af',fontSize:'12px',lineHeight:1.4}}>
                {isTyping?shownBody:body}
                {bodyOver&&<span style={{color:'#ef4444',fontSize:'10px',marginLeft:'4px'}}>⚠ {body.length}/100</span>}
              </div>
            </div>
          </div>
        </div>
        <div style={{height:'3px',background:'rgba(255,255,255,.08)',margin:'0 14px',borderRadius:'2px'}}/>
        <div style={{padding:'6px 14px 10px',display:'flex',justifyContent:'center',alignItems:'center'}}>
          <div style={{width:'32px',height:'3px',background:'rgba(255,255,255,.2)',borderRadius:'2px'}}/>
        </div>
      </div>
    </div>
  )
}

function GlanceMockup({ data, isTyping }) {
  const cardText = safeGet(data,'card_text') || 'Exclusive deal available'
  const cta = safeGet(data,'cta') || 'View Offer'
  const over = cardText.length > 160
  const { shown, done } = useTypewriter(cardText, 8, isTyping)
  return (
    <div style={{background:'#0a0a0a',borderRadius:'24px',overflow:'hidden',border:'1px solid #2d2d2d',fontFamily:'system-ui',boxShadow:'0 8px 32px rgba(0,0,0,.6)',maxWidth:'320px',margin:'0 auto'}}>
      {/* Status bar */}
      <div style={{background:'#0a0a0a',padding:'10px 18px 4px',display:'flex',justifyContent:'space-between'}}>
        <span style={{color:'white',fontSize:'12px',fontWeight:600}}>12:47</span>
        <div style={{display:'flex',gap:'5px',alignItems:'center',color:'white',fontSize:'11px'}}>
          <span>📶</span><span>🔋</span>
        </div>
      </div>
      {/* Big clock */}
      <div style={{textAlign:'center',paddingTop:'8px',paddingBottom:'24px'}}>
        <div style={{color:'white',fontSize:'52px',fontWeight:200,lineHeight:1,letterSpacing:'-2px'}}>12:47</div>
        <div style={{color:'rgba(255,255,255,.5)',fontSize:'12px',marginTop:'4px'}}>Thursday, March 6</div>
      </div>
      {/* Glance card */}
      <div style={{margin:'0 12px 16px',background:'rgba(255,255,255,.1)',borderRadius:'16px',padding:'14px',backdropFilter:'blur(20px)',border:'1px solid rgba(255,255,255,.1)'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
          <div style={{width:'24px',height:'24px',borderRadius:'6px',background:'var(--accent,#FF6B35)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,color:'white',fontSize:'11px'}}>G</div>
          <span style={{color:'rgba(255,255,255,.7)',fontSize:'11px',fontWeight:600}}>GrabOn</span>
          <span style={{color:'rgba(255,255,255,.3)',fontSize:'10px',marginLeft:'auto'}}>now</span>
        </div>
        <p style={{color:'white',fontSize:'12px',lineHeight:1.5,margin:'0 0 10px'}}>
          {isTyping?shown:cardText}{isTyping&&!done?<span className="blink-cur">|</span>:null}
        </p>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{color:'var(--accent,#FF6B35)',fontSize:'11px',fontWeight:700}}>{cta}</span>
          {over && <span style={{color:'#ef4444',fontSize:'10px'}}>⚠ {cardText.length}/160</span>}
        </div>
      </div>
    </div>
  )
}

function PayUMockup({ data, isTyping, merchant }) {
  const bannerText = safeGet(data,'banner_text') || 'Save more on this order'
  const subText = safeGet(data,'sub_text') || 'Apply coupon at checkout'
  const over = bannerText.length > 40
  const { shown, done } = useTypewriter(bannerText, 12, isTyping)
  return (
    <div style={{background:'#1a1a1a',borderRadius:'10px',overflow:'hidden',border:'1px solid #2d2d2d',fontFamily:'system-ui',boxShadow:'0 4px 24px rgba(0,0,0,.4)'}}>
      {/* Cart summary */}
      <div style={{background:'#111',padding:'12px 16px',borderBottom:'1px solid #222'}}>
        <div style={{color:'#6b7280',fontSize:'11px',marginBottom:'8px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em'}}>Order Summary</div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'4px'}}>
          <span style={{color:'#9ca3af',fontSize:'12px'}}>{merchant || 'Order'} (1 item)</span>
          <span style={{color:'#e5e7eb',fontSize:'12px',fontWeight:600}}>₹499</span>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid #2d2d2d',paddingTop:'8px',marginTop:'8px'}}>
          <span style={{color:'#e5e7eb',fontWeight:700,fontSize:'13px'}}>Total</span>
          <span style={{color:'#e5e7eb',fontWeight:700,fontSize:'13px'}}>₹499</span>
        </div>
      </div>
      {/* Banner */}
      <div style={{background:'linear-gradient(90deg,var(--accent,#FF6B35),#ff8c38)',padding:'8px 16px',display:'flex',alignItems:'center',gap:'8px'}}>
        <span style={{color:'white',fontSize:'16px'}}>🎁</span>
        <div style={{flex:1}}>
          <div style={{color:'white',fontWeight:700,fontSize:'13px'}}>
            {isTyping?shown:bannerText}{isTyping&&!done?<span className="blink-cur">|</span>:null}
          </div>
          {over&&<div style={{color:'rgba(255,255,255,.7)',fontSize:'10px'}}>⚠ Over 40 char limit ({bannerText.length})</div>}
        </div>
      </div>
      <div style={{padding:'10px 16px 4px',background:'#111'}}>
        <div style={{color:'#9ca3af',fontSize:'11px',marginBottom:'10px'}}>{subText}</div>
        <button style={{width:'100%',padding:'12px',background:'var(--accent,#FF6B35)',color:'white',border:'none',borderRadius:'8px',fontWeight:700,fontSize:'14px',cursor:'pointer'}}>
          Pay ₹499
        </button>
      </div>
    </div>
  )
}

function InstagramMockup({ data, category, merchant, isTyping }) {
  const caption = safeGet(data,'caption') || 'Check out this amazing deal!'
  const hashtags = safeGet(data,'hashtags') || '#grabon #deals #offer'
  const { shown: shownCaption, done: capDone } = useTypewriter(caption, 8, isTyping)
  const { shown: shownTags } = useTypewriter(hashtags, 6, isTyping)
  const gradient = CAT_GRADIENT[category] || CAT_GRADIENT.default
  return (
    <div style={{background:'#000',borderRadius:'10px',overflow:'hidden',border:'1px solid #262626',fontFamily:'system-ui',boxShadow:'0 4px 24px rgba(0,0,0,.5)'}}>
      {/* Post header */}
      <div style={{padding:'10px 12px',display:'flex',alignItems:'center',gap:'9px'}}>
        <div style={{width:'32px',height:'32px',borderRadius:'50%',background:'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',padding:'2px',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{width:'26px',height:'26px',borderRadius:'50%',background:'var(--accent,#FF6B35)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,color:'white',fontSize:'11px'}}>G</div>
        </div>
        <div style={{flex:1}}>
          <span style={{color:'#f5f5f5',fontWeight:600,fontSize:'13px'}}>grabon_deals</span>
          <span style={{marginLeft:'4px',color:'#0095f6',fontSize:'12px'}}>✓</span>
        </div>
        <span style={{color:'#737373',fontSize:'18px'}}>⋯</span>
      </div>
      {/* Post image */}
      <div style={{background:gradient,height:'220px',position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.15)'}}/>
        <div style={{position:'relative',zIndex:1,textAlign:'center'}}>
          <div style={{color:'white',fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'28px',textShadow:'0 2px 8px rgba(0,0,0,.4)'}}>{merchant||'GrabOn'}</div>
          <div style={{color:'rgba(255,255,255,.85)',fontSize:'14px',marginTop:'4px',textShadow:'0 1px 4px rgba(0,0,0,.4)'}}>Exclusive Deal</div>
        </div>
      </div>
      {/* Actions */}
      <div style={{padding:'8px 12px',display:'flex',gap:'12px',borderBottom:'1px solid #262626'}}>
        {['❤', '💬', '📤'].map((icon,i)=><span key={i} style={{fontSize:'20px',cursor:'pointer',filter:'invert(1)'}}>{icon}</span>)}
        <span style={{marginLeft:'auto',fontSize:'20px',cursor:'pointer',filter:'invert(1)'}}>🔖</span>
      </div>
      {/* Caption */}
      <div style={{padding:'10px 12px 14px'}}>
        <span style={{color:'#f5f5f5',fontWeight:600,fontSize:'13px',marginRight:'6px'}}>grabon_deals</span>
        <span style={{color:'#f5f5f5',fontSize:'13px',lineHeight:1.4}}>
          {isTyping?shownCaption:caption}{isTyping&&!capDone?<span className="blink-cur">|</span>:null}
        </span>
        <div style={{marginTop:'6px',color:'#00D4FF',fontSize:'12px',lineHeight:1.5}}>
          {isTyping?shownTags:hashtags}
        </div>
        <div style={{color:'#737373',fontSize:'11px',marginTop:'6px'}}>View all comments · just now</div>
      </div>
    </div>
  )
}

function DeviceMockup({ channel, data, category, merchant, strategy, dealMeta, isTyping }) {
  if (!data) return (
    <div className="shimmer-bg" style={{borderRadius:'10px',height:'250px',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <span style={{color:'#374151',fontSize:'12px',fontFamily:"'JetBrains Mono',monospace"}}>Generating {CHANNEL_SHORT[channel]} copy...</span>
    </div>
  )
  if (channel==='email') return <EmailMockup data={data} merchant={merchant} category={category} strategy={strategy} dealMeta={dealMeta} isTyping={isTyping}/>
  if (channel==='whatsapp') return <WhatsAppMockup data={data} isTyping={isTyping}/>
  if (channel==='push') return <PushMockup data={data} isTyping={isTyping}/>
  if (channel==='glance') return <GlanceMockup data={data} isTyping={isTyping}/>
  if (channel==='payu_banner') return <PayUMockup data={data} isTyping={isTyping} merchant={merchant}/>
  if (channel==='instagram') return <InstagramMockup data={data} category={category} merchant={merchant} isTyping={isTyping}/>
  return null
}

/* ============================================================
   FEATURE 6: LANGUAGE DISSOLUTION + OUTPUT GRID
   ============================================================ */
function OutputGrid({ variants, merchant, category, isProcessing, dealMeta }) {
  const [activeCh, setActiveCh] = useState('email')
  const [activeLang, setActiveLang] = useState('en')
  const [activeSt, setActiveSt] = useState('urgency')
  const [langFading, setLangFading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const prevVariantsRef = useRef(null)

  useEffect(()=>{
    if (variants && !prevVariantsRef.current) { setIsTyping(true); setTimeout(()=>setIsTyping(false),3000) }
    prevVariantsRef.current = variants
  },[variants])

  const changeLang = (lang) => {
    if (lang===activeLang) return
    setLangFading(true)
    setTimeout(()=>{ setActiveLang(lang); setLangFading(false) },200)
  }

  const data = safeGet(variants,activeCh,activeSt,activeLang)

  const doCSV = () => {
    if (!variants) return
    const rows=[]
    for (const ch of CHANNELS) for (const st of STRATEGIES) for (const lg of LANGUAGES) {
      const v=safeGet(variants,ch,st,lg); if(!v) continue
      const text=typeof v==='object'?Object.values(v).join(' | '):String(v)
      rows.push(`"${CHANNEL_SHORT[ch]}","${STRATEGY_FULL[st]}","${LANG_FULL[lg]}","${text.replace(/"/g,'""')}"`)
    }
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['Channel,Strategy,Language,Content\n'+rows.join('\n')],{type:'text/csv'}))
    a.download=`${merchant||'deal'}_54_variants.csv`; a.click()
  }
  const doJSON = () => {
    if (!variants) return
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(variants,null,2)],{type:'application/json'}))
    a.download=`${merchant||'deal'}_54_variants.json`; a.click()
  }

  return (
    <div style={{background:'#111827',border:'1px solid #1e2a45',borderRadius:'12px',padding:'20px',position:'relative'}}>
      {showModal && <AllStringsModal variants={variants} merchant={merchant} onClose={()=>setShowModal(false)}/>}
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
        <div>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'16px',color:'#F1F5F9',margin:0}}>
            Generated Copy
            <span style={{color:'var(--accent,#FF6B35)',marginLeft:'8px',fontFamily:"'JetBrains Mono',monospace",fontSize:'13px'}}>54 variants</span>
          </h2>
          <p style={{color:'#475569',fontSize:'11px',margin:'2px 0 0',fontFamily:"'JetBrains Mono',monospace"}}>6 channels × 3 strategies × 3 languages</p>
        </div>
        <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
          {variants&&<button onClick={()=>setShowModal(true)} className="btn-accent" style={{padding:'6px 12px',borderRadius:'6px',border:'none',color:'white',fontSize:'11px',fontWeight:700,cursor:'pointer',letterSpacing:'.04em'}}>⊞ VIEW ALL 54</button>}
          {variants&&<button onClick={doCSV} style={{padding:'6px 12px',borderRadius:'6px',border:'1px solid #22c55e',background:'rgba(34,197,94,.1)',color:'#4ade80',fontSize:'11px',fontWeight:700,cursor:'pointer'}}>⬇ CSV</button>}
          {variants&&<button onClick={doJSON} style={{padding:'6px 12px',borderRadius:'6px',border:'1px solid #3b82f6',background:'rgba(59,130,246,.1)',color:'#60a5fa',fontSize:'11px',fontWeight:700,cursor:'pointer'}}>⬇ JSON</button>}
        </div>
      </div>

      {/* Channel tabs */}
      <div style={{display:'flex',gap:'4px',marginBottom:'14px',overflowX:'auto',paddingBottom:'2px'}}>
        {CHANNELS.map(ch=>(
          <button key={ch} onClick={()=>setActiveCh(ch)}
            style={{padding:'7px 12px',borderRadius:'6px',border:'none',fontWeight:700,fontSize:'11px',cursor:'pointer',whiteSpace:'nowrap',letterSpacing:'.04em',transition:'all .2s',
              background: activeCh===ch?CH_BG[ch]:'transparent',
              color: activeCh===ch?CH_COLOR[ch]:'#475569',
              borderBottom: activeCh===ch?`2px solid ${CH_COLOR[ch]}`:'2px solid transparent'
            }}>
            {CHANNEL_SHORT[ch]}
          </button>
        ))}
      </div>

      {/* Strategy + Language selectors */}
      <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:'4px'}}>
          {STRATEGIES.map(st=>(
            <button key={st} onClick={()=>setActiveSt(st)}
              style={{padding:'4px 10px',borderRadius:'20px',border:'none',fontSize:'10px',fontWeight:700,cursor:'pointer',letterSpacing:'.05em',transition:'all .2s',
                background: activeSt===st?'var(--accent,#FF6B35)':'rgba(255,255,255,.05)',
                color: activeSt===st?'white':'#64748b'
              }}>
              {STRATEGY_SHORT[st]}
            </button>
          ))}
        </div>
        <div style={{display:'flex',gap:'4px',marginLeft:'auto'}}>
          {LANGUAGES.map(lg=>(
            <button key={lg} onClick={()=>changeLang(lg)}
              style={{padding:'4px 12px',borderRadius:'20px',border:'none',fontSize:'11px',fontWeight:700,cursor:'pointer',transition:'all .2s',
                background: activeLang===lg?'#00D4FF':'rgba(255,255,255,.05)',
                color: activeLang===lg?'#0A0F1E':'#64748b'
              }}>
              {LANG_FLAGS[lg]} {LANG_FULL[lg]}
            </button>
          ))}
        </div>
      </div>

      {/* Language watermark */}
      <div style={{position:'relative'}}>
        <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',fontSize:'100px',fontWeight:900,opacity:.03,pointerEvents:'none',color:'white',userSelect:'none',zIndex:0,lineHeight:1}}>
          {activeLang==='hi'?'हिं':activeLang==='te'?'తె':'Aa'}
        </div>
        <div style={{opacity:langFading?0:1,transition:'opacity .2s ease',position:'relative',zIndex:1}}>
          {variants ? (
            <DeviceMockup channel={activeCh} data={data} category={category} merchant={merchant} strategy={activeSt} dealMeta={dealMeta} isTyping={isTyping}/>
          ) : (
            isProcessing ? (
              <div className="shimmer-bg" style={{borderRadius:'10px',height:'260px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <div style={{textAlign:'center'}}>
                  <div style={{color:'#374151',fontSize:'12px',fontFamily:"'JetBrains Mono',monospace",marginBottom:'8px'}}>Generating 54 variants...</div>
                  <div style={{color:'var(--accent,#FF6B35)',fontSize:'24px',animation:'hexPulseAnim 1s ease-in-out infinite'}}>⚡</div>
                </div>
              </div>
            ) : (
              <div style={{borderRadius:'10px',height:'260px',display:'flex',alignItems:'center',justifyContent:'center',border:'1px dashed #1e2a45'}}>
                <span style={{color:'#374151',fontSize:'12px',fontFamily:"'JetBrains Mono',monospace"}}>Device mockup appears after generation</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* All 3 variants summary row */}
      {variants && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginTop:'16px'}}>
          {STRATEGIES.map(st=>{
            const v=safeGet(variants,activeCh,st,activeLang)
            if (!v) return null
            const text=typeof v==='object'?Object.values(v)[0]:String(v)
            return (
              <div key={st} onClick={()=>setActiveSt(st)} style={{padding:'10px',background:activeSt===st?'rgba(255,107,53,.08)':'rgba(255,255,255,.03)',borderRadius:'8px',border:`1px solid ${activeSt===st?'var(--accent,#FF6B35)':'#1e2a45'}`,cursor:'pointer',transition:'all .2s'}}>
                <div style={{fontSize:'9px',fontWeight:700,color:activeSt===st?'var(--accent,#FF6B35)':'#475569',letterSpacing:'.06em',marginBottom:'4px',fontFamily:"'JetBrains Mono',monospace"}}>{STRATEGY_SHORT[st]}</div>
                <div style={{color:'#94a3b8',fontSize:'11px',lineHeight:1.4,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{text}</div>
                <div style={{marginTop:'6px',display:'flex',justifyContent:'flex-end'}}><CopyBtn text={typeof v==='object'?Object.values(v).join(' | '):String(v)}/></div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   FEATURE 4: ALL 54 STRINGS MODAL (THE WALL)
   ============================================================ */
function AllStringsModal({ variants, merchant, onClose }) {
  const [search, setSearch] = useState('')
  const [filterCh, setFilterCh] = useState('all')
  const [filterLang, setFilterLang] = useState('all')

  const cards = ALL_SLOTS.map((slot,idx)=>{
    const v = safeGet(variants,slot.channel,slot.strategy,slot.language)
    const enV = safeGet(variants,slot.channel,slot.strategy,'en')
    const hiV = safeGet(variants,slot.channel,slot.strategy,'hi')
    const text = v ? (typeof v==='object'?Object.entries(v).map(([k,val])=>`${k}: ${val}`).join(' · '):String(v)) : ''
    const backText = slot.language!=='hi' ? (hiV?(typeof hiV==='object'?Object.values(hiV).join(' · '):String(hiV)):'') : (enV?(typeof enV==='object'?Object.values(enV).join(' · '):String(enV)):'')
    const limit = CHAR_LIMITS[`${slot.channel}.message`]||CHAR_LIMITS[`${slot.channel}.title`]||CHAR_LIMITS[`${slot.channel}.card_text`]||CHAR_LIMITS[`${slot.channel}.banner_text`]
    const over = limit && text.replace(/\w+: /g,'').length > limit
    return { ...slot, text, backText, over, idx }
  }).filter(c=>c.text)

  const filtered = cards.filter(c=>
    (filterCh==='all'||c.channel===filterCh) &&
    (filterLang==='all'||c.language===filterLang) &&
    (!search||c.text.toLowerCase().includes(search.toLowerCase()))
  )

  const doCSV = () => {
    const rows=filtered.map(c=>`"${CHANNEL_SHORT[c.channel]}","${STRATEGY_FULL[c.strategy]}","${LANG_FULL[c.language]}","${c.text.replace(/"/g,'""')}"`)
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['Channel,Strategy,Language,Content\n'+rows.join('\n')],{type:'text/csv'}))
    a.download=`${merchant||'deal'}_54_variants.csv`; a.click()
  }
  const doJSON = () => {
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(variants,null,2)],{type:'application/json'}))
    a.download=`${merchant||'deal'}_54_variants.json`; a.click()
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:100,display:'flex',alignItems:'stretch',justifyContent:'center',backdropFilter:'blur(4px)',padding:'16px'}} onClick={onClose}>
      <div style={{background:'#111827',borderRadius:'16px',border:'1px solid #1e2a45',width:'100%',maxWidth:'1100px',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 80px rgba(0,0,0,.8)'}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid #1e2a45',flexWrap:'wrap',gap:'8px'}}>
          <div>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'18px',color:'#F1F5F9',margin:0}}>The Wall</h2>
            <p style={{color:'#475569',fontSize:'11px',margin:'2px 0 0',fontFamily:"'JetBrains Mono',monospace"}}>All 54 variants · {filtered.length} shown · hover card to see Hindi translation</p>
          </div>
          <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
            <button onClick={doCSV} style={{padding:'6px 12px',borderRadius:'6px',border:'1px solid #22c55e',background:'rgba(34,197,94,.1)',color:'#4ade80',fontSize:'11px',fontWeight:700,cursor:'pointer'}}>⬇ CSV</button>
            <button onClick={doJSON} style={{padding:'6px 12px',borderRadius:'6px',border:'1px solid #3b82f6',background:'rgba(59,130,246,.1)',color:'#60a5fa',fontSize:'11px',fontWeight:700,cursor:'pointer'}}>⬇ JSON</button>
            <button onClick={onClose} style={{padding:'6px 14px',borderRadius:'6px',border:'1px solid #374151',background:'rgba(255,255,255,.05)',color:'#9ca3af',fontSize:'12px',fontWeight:700,cursor:'pointer'}}>✕ Close</button>
          </div>
        </div>
        {/* Filters */}
        <div style={{display:'flex',gap:'8px',padding:'12px 20px',borderBottom:'1px solid #1e2a45',flexWrap:'wrap'}}>
          <input type="text" placeholder="🔍 Search strings..." value={search} onChange={e=>setSearch(e.target.value)}
            style={{flex:1,minWidth:'200px',padding:'7px 12px',borderRadius:'6px',border:'1px solid #2d3748',background:'rgba(255,255,255,.04)',color:'#E2E8F0',fontSize:'12px',outline:'none',fontFamily:"'JetBrains Mono',monospace"}}/>
          <select value={filterCh} onChange={e=>setFilterCh(e.target.value)} style={{padding:'7px 12px',borderRadius:'6px',border:'1px solid #2d3748',background:'#1a2238',color:'#E2E8F0',fontSize:'12px',outline:'none'}}>
            <option value="all">All Channels</option>
            {CHANNELS.map(c=><option key={c} value={c}>{CHANNEL_SHORT[c]}</option>)}
          </select>
          <select value={filterLang} onChange={e=>setFilterLang(e.target.value)} style={{padding:'7px 12px',borderRadius:'6px',border:'1px solid #2d3748',background:'#1a2238',color:'#E2E8F0',fontSize:'12px',outline:'none'}}>
            <option value="all">All Languages</option>
            {LANGUAGES.map(l=><option key={l} value={l}>{LANG_FLAGS[l]} {LANG_FULL[l]}</option>)}
          </select>
        </div>
        {/* Grid */}
        <div style={{overflowY:'auto',flex:1,padding:'16px 20px'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'12px'}}>
            {filtered.map((card,i)=>(
              <div key={card.idx} className="card-flip card-stagger" style={{animationDelay:`${i*20}ms`,height:'160px',position:'relative'}}>
                <div className="card-flip-inner" style={{height:'100%'}}>
                  {/* Front */}
                  <div className="card-face" style={{background:CH_BG[card.channel],border:`1.5px solid ${CH_COLOR[card.channel]}`,borderRadius:'10px',padding:'12px',display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
                    <div style={{display:'flex',gap:'6px',alignItems:'flex-start',flexWrap:'wrap',marginBottom:'8px'}}>
                      <span style={{fontSize:'10px',fontWeight:700,padding:'2px 7px',borderRadius:'20px',background:`${CH_COLOR[card.channel]}22`,color:CH_COLOR[card.channel],letterSpacing:'.05em',border:`1px solid ${CH_COLOR[card.channel]}44`}}>{CHANNEL_SHORT[card.channel].toUpperCase()}</span>
                      <span style={{fontSize:'10px',fontWeight:700,padding:'2px 7px',borderRadius:'20px',background:'rgba(255,107,53,.15)',color:'#FF6B35',letterSpacing:'.05em'}}>{STRATEGY_SHORT[card.strategy]}</span>
                      <span style={{fontSize:'10px',padding:'2px 7px',borderRadius:'20px',background:'rgba(255,255,255,.06)',color:'#94a3b8'}}>{LANG_FLAGS[card.language]} {LANG_FULL[card.language]}</span>
                      {card.over&&<span style={{fontSize:'9px',padding:'2px 6px',borderRadius:'4px',background:'rgba(239,68,68,.2)',color:'#f87171',fontWeight:700}}>OVER LIMIT</span>}
                    </div>
                    <p style={{color:'#e2e8f0',fontSize:'12px',lineHeight:1.5,flex:1,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',margin:0}}>{card.text}</p>
                    <div style={{marginTop:'8px',display:'flex',justifyContent:'flex-end'}}><CopyBtn text={card.text}/></div>
                  </div>
                  {/* Back (Hindi translation) */}
                  {card.backText && (
                    <div className="card-face card-face-back" style={{background:'rgba(139,92,246,.08)',border:'1.5px solid #7c3aed',borderRadius:'10px',padding:'12px',display:'flex',flexDirection:'column',justifyContent:'center'}}>
                      <div style={{color:'#7c3aed',fontSize:'9px',fontWeight:700,letterSpacing:'.08em',marginBottom:'8px',fontFamily:"'JetBrains Mono',monospace"}}>
                        {card.language!=='hi'?'🇮🇳 HINDI TRANSLATION':'🇬🇧 ENGLISH TRANSLATION'}
                      </div>
                      <p style={{color:'#e2e8f0',fontSize:'12px',lineHeight:1.6,margin:0}}>{card.backText}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   FEATURE 5: HEX DELIVERY WAR ROOM
   ============================================================ */
function HexDeliveryGrid({ deliveries, isProcessing }) {
  const [tooltip, setTooltip] = useState(null)

  const slotMap = {}
  ;(deliveries||[]).forEach(d=>{
    const k=`${d.channel}__${d.variant}__${d.language}`
    slotMap[k]=d
  })

  const rows = []
  for (let r=0;r<6;r++) rows.push(ALL_SLOTS.slice(r*9,r*9+9))

  const getHexState = (slot) => {
    const d=slotMap[`${slot.channel}__${slot.strategy}__${slot.language}`]
    if (!d) return isProcessing?'pending':'idle'
    if (d.status==='delivered') return 'delivered'
    if (d.status==='permanently_failed') return 'failed'
    if (d.status==='retrying'||d.attempts>1) return 'retrying'
    return 'inflight'
  }

  const hexColors = {idle:'#1a1f35',pending:'#1e2a45',delivered:'#00D4FF',failed:'#FF3333',inflight:'#FFD700',retrying:'#FF6B35'}
  const delivered = (deliveries||[]).filter(d=>d.status==='delivered').length
  const failed = (deliveries||[]).filter(d=>d.status==='permanently_failed').length
  const retried = (deliveries||[]).filter(d=>d.attempts>1).length

  return (
    <div style={{background:'#111827',border:'1px solid #1e2a45',borderRadius:'12px',padding:'20px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
        <h2 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'16px',color:'#F1F5F9',margin:0}}>
          Delivery War Room
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'12px',color:'#475569',fontWeight:400,marginLeft:'10px'}}>54-hex grid</span>
        </h2>
        {retried>0&&<span style={{fontSize:'11px',background:'rgba(255,107,53,.1)',color:'#FF6B35',border:'1px solid rgba(255,107,53,.3)',padding:'3px 10px',borderRadius:'20px',fontFamily:"'JetBrains Mono',monospace"}}>⚠ {retried} retries</span>}
      </div>

      {/* Legend */}
      <div style={{display:'flex',gap:'16px',marginBottom:'16px',flexWrap:'wrap'}}>
        {[['idle','Pending','#1e2a45'],['inflight','In-Flight','#FFD700'],['delivered','Delivered','#00D4FF'],['retrying','Retrying','#FF6B35'],['failed','Failed','#FF3333']].map(([s,l,c])=>(
          <div key={s} style={{display:'flex',alignItems:'center',gap:'5px'}}>
            <div style={{width:'10px',height:'10px',background:c,clipPath:'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)',flexShrink:0}}/>
            <span style={{color:'#64748b',fontSize:'10px',fontFamily:"'JetBrains Mono',monospace"}}>{l}</span>
          </div>
        ))}
      </div>

      {/* Hex grid */}
      <div style={{position:'relative',overflowX:'auto',paddingBottom:'8px'}}>
        {tooltip&&(
          <div style={{position:'fixed',background:'#0D1117',border:'1px solid #2d3748',borderRadius:'8px',padding:'10px 14px',zIndex:50,pointerEvents:'none',color:'#E2E8F0',fontSize:'11px',fontFamily:"'JetBrains Mono',monospace",left:tooltip.x+10,top:tooltip.y-60,maxWidth:'240px',lineHeight:1.6,boxShadow:'0 4px 20px rgba(0,0,0,.5)'}}>
            <div style={{color:'var(--accent,#FF6B35)',fontWeight:700}}>{CHANNEL_SHORT[tooltip.d.channel]} · {STRATEGY_SHORT[tooltip.d.strategy]} · {LANG_FLAGS[tooltip.d.language]}</div>
            <div>Status: <span style={{color:hexColors[tooltip.d.state]}}>{tooltip.d.state}</span></div>
            {tooltip.d.delivery&&<><div>Attempts: {tooltip.d.delivery.attempts||1}</div><div>ID: {(tooltip.d.delivery.delivery_id||'').slice(0,12)}...</div></>}
          </div>
        )}
        <div style={{display:'inline-flex',flexDirection:'column',gap:'3px',minWidth:'max-content'}}>
          {rows.map((row,ri)=>(
            <div key={ri} style={{display:'flex',gap:'3px',marginLeft:ri%2===1?'37px':'0'}}>
              {row.map((slot,si)=>{
                const state=getHexState(slot)
                const d=slotMap[`${slot.channel}__${slot.strategy}__${slot.language}`]
                const color=hexColors[state]
                const isFlash=state==='delivered'&&d&&d._fresh
                return (
                  <div key={si}
                    style={{width:'70px',height:'80px',position:'relative',cursor:'pointer',flexShrink:0}}
                    onMouseEnter={e=>setTooltip({x:e.clientX,y:e.clientY,d:{...slot,state,delivery:d}})}
                    onMouseLeave={()=>setTooltip(null)}
                  >
                    <div className={`hex-shape ${state==='pending'||state==='idle'?'hex-pending':''} ${state==='inflight'?'hex-inflight':''} ${state==='retrying'?'hex-retrying':''}`}
                      style={{width:'100%',height:'100%',background:color,transition:'background .5s ease',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'1px'}}>
                      <span style={{fontSize:'11px',lineHeight:1}}>{LANG_FLAGS[slot.language]}</span>
                      <span style={{fontSize:'8px',color: state==='delivered'||state==='inflight'?'#000':'rgba(255,255,255,.7)',fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{CHANNEL_SHORT[slot.channel].slice(0,2).toUpperCase()}</span>
                      {d&&d.attempts>1&&<span style={{fontSize:'8px',color:'white',fontWeight:700}}>×{d.attempts}</span>}
                      {state==='failed'&&<span style={{fontSize:'10px'}}>✕</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      {deliveries&&deliveries.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'8px',marginTop:'20px',paddingTop:'16px',borderTop:'1px solid #1e2a45',textAlign:'center'}}>
          {[['Total','54','#94a3b8'],[`Delivered`,delivered,'#00D4FF'],['Retried',retried,'#FF6B35'],['Failed',failed,'#FF3333'],[`Success`,`${Math.round((delivered/54)*100)||0}%`,'#4ade80']].map(([label,val,col])=>(
            <div key={label}>
              <div style={{fontSize:'22px',fontWeight:700,color:col,fontFamily:"'Syne',sans-serif"}}>{val}</div>
              <div style={{fontSize:'10px',color:'#475569',fontFamily:"'JetBrains Mono',monospace",marginTop:'2px'}}>{label}</div>
            </div>
          ))}
        </div>
      )}
      {(!deliveries||deliveries.length===0)&&(
        <div style={{textAlign:'center',padding:'24px 0',color:'#374151',fontSize:'12px',fontFamily:"'JetBrains Mono',monospace"}}>
          {isProcessing?'⚡ Hexagons light up as deliveries complete...':'Hex grid activates during distribution'}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   FEATURE 7: A/B TESTING RACE PANEL — realistic random walk
   ============================================================ */

// Category-specific baselines: [min, max] starting CTR range per strategy
const CAT_BASELINES = {
  food:        { urgency:[18,22], value_highlight:[12,15], social_proof:[12,15] },
  travel:      { urgency:[12,15], value_highlight:[18,22], social_proof:[12,15] },
  fashion:     { urgency:[12,15], value_highlight:[12,15], social_proof:[18,22] },
  electronics: { urgency:[14,18], value_highlight:[18,22], social_proof:[12,15] },
  health:      { urgency:[12,15], value_highlight:[14,18], social_proof:[18,22] },
  beauty:      { urgency:[12,15], value_highlight:[14,18], social_proof:[18,22] },
}
const HIST_LEN = 10
const CTR_MIN = 3, CTR_MAX = 35
function rnd(a,b){ return a + Math.random()*(b-a) }
function clampCTR(v){ return Math.max(CTR_MIN, Math.min(CTR_MAX, v)) }
function initCTRs(category){
  const bl = CAT_BASELINES[category] || CAT_BASELINES.food
  return {
    urgency:         +rnd(...bl.urgency).toFixed(2),
    value_highlight: +rnd(...bl.value_highlight).toFixed(2),
    social_proof:    +rnd(...bl.social_proof).toFixed(2),
  }
}
function initHistory(ctrs){
  return {
    urgency:         Array(HIST_LEN).fill(ctrs.urgency),
    value_highlight: Array(HIST_LEN).fill(ctrs.value_highlight),
    social_proof:    Array(HIST_LEN).fill(ctrs.social_proof),
  }
}

// Tiny sparkline: 60×22 SVG polyline of last HIST_LEN data points
function Sparkline({ data, color, isWin }){
  const w=60, h=22, pad=2
  const lo=Math.min(...data), hi=Math.max(...data)
  const range=Math.max(hi-lo,0.5)
  const pts=data.map((v,i)=>{
    const x=pad+(i/(HIST_LEN-1))*(w-pad*2)
    const y=h-pad-((v-lo)/range)*(h-pad*2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const lastDir = data[HIST_LEN-1] >= data[HIST_LEN-2] ? '▲' : '▼'
  const trendCol = data[HIST_LEN-1] >= data[HIST_LEN-2] ? '#4ade80' : '#f87171'
  return (
    <div style={{display:'flex',alignItems:'center',gap:'4px'}}>
      <svg width={w} height={h} style={{overflow:'visible'}}>
        <polyline points={pts} fill="none" stroke={isWin?'#FFD700':color} strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round"
          style={{filter:isWin?'drop-shadow(0 0 3px #FFD700)':undefined}}/>
        {/* last point dot */}
        {data.length>0&&(
          <circle cx={+(pad+(w-pad*2)).toFixed(1)} cy={+(h-pad-((data[HIST_LEN-1]-lo)/range)*(h-pad*2)).toFixed(1)}
            r="2" fill={isWin?'#FFD700':color}/>
        )}
      </svg>
      <span style={{fontSize:'10px',color:trendCol,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{lastDir}</span>
    </div>
  )
}

function ABTestRace({ channel, variants, category }) {
  const cat = category || 'food'
  const [ctrs, setCtrs]       = useState(()=>initCTRs(cat))
  const [history, setHistory] = useState(()=>{ const c=initCTRs(cat); return initHistory(c) })
  const [sessions, setSessions] = useState(1247)
  const [activeSt, setActiveSt] = useState(null)
  const [dipTarget, setDipTarget] = useState(null)   // which variant is currently dipping

  // Re-initialise when category changes
  useEffect(()=>{
    const fresh = initCTRs(cat)
    setCtrs(fresh)
    setHistory(initHistory(fresh))
    setSessions(1247)
    setActiveSt(null)
    setDipTarget(null)
  },[cat])

  // ── Main 2-second random-walk tick ──────────────────────────
  useEffect(()=>{
    const id = setInterval(()=>{
      setCtrs(prev=>{
        // random walk: step between -0.3 and +0.8 per variant
        const next = {}
        for (const st of STRATEGIES){
          const step = rnd(-0.3, 0.8)
          next[st] = +clampCTR(prev[st] + step).toFixed(2)
        }
        return next
      })
      setHistory(prev=>{
        // append latest ctrs snapshot — we read from the functional updater pattern
        const appended = {}
        for (const st of STRATEGIES){
          appended[st] = null // placeholder; filled below via setCtrs callback sync issue
        }
        return prev // actual append happens in the combined updater below
      })
      // Append current ctrs to history in a combined state update
      setCtrs(c=>{
        setHistory(h=>{
          const next={}
          for (const st of STRATEGIES) next[st]=[...h[st].slice(-(HIST_LEN-1)), c[st]]
          return next
        })
        return c
      })
      setSessions(s=>s + Math.floor(rnd(8, 45)))
    }, 2000)
    return ()=>clearInterval(id)
  },[cat])

  // ── Occasional dip: every 8-12 seconds ──────────────────────
  useEffect(()=>{
    let timer
    function scheduleDip(){
      const delay = rnd(8000, 12000)
      timer = setTimeout(()=>{
        const target = STRATEGIES[Math.floor(Math.random()*STRATEGIES.length)]
        const drop = rnd(1.5, 2.5)
        setDipTarget(target)
        setCtrs(prev=>({ ...prev, [target]: +clampCTR(prev[target]-drop).toFixed(2) }))
        setCtrs(c=>{ setHistory(h=>({ ...h, [target]:[...h[target].slice(-(HIST_LEN-1)),c[target]] })); return c })
        // clear dip highlight after 1 tick
        setTimeout(()=>setDipTarget(null), 2200)
        scheduleDip()
      }, delay)
    }
    scheduleDip()
    return ()=>clearTimeout(timer)
  },[cat])

  const vals = STRATEGIES.map(s=>ctrs[s])
  const maxVal = Math.max(...vals)
  const minVal = Math.min(...vals)
  // winner only declared if gap > 1.5% to allow genuine leader changes
  const winner = maxVal - minVal > 1.5 ? STRATEGIES[vals.indexOf(maxVal)] : null
  const barScaleMax = maxVal * 1.15

  const accentColors = {
    urgency:'#FF6B35', value_highlight:'#00D4FF', social_proof:'#a855f7'
  }

  return (
    <div style={{background:'#111827',border:'1px solid #1e2a45',borderRadius:'12px',padding:'20px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
        <div>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'16px',color:'#F1F5F9',margin:0}}>A/B Performance Simulation</h2>
          <div style={{display:'flex',alignItems:'center',gap:'10px',marginTop:'3px'}}>
            <p style={{color:'#374151',fontSize:'10px',margin:0,fontStyle:'italic',fontFamily:"'JetBrains Mono',monospace"}}>Simulated data for demo · connect real analytics in production</p>
            <span style={{fontSize:'10px',background:`${CAT_BASELINES[cat]?'rgba(255,107,53,.12)':'rgba(100,116,139,.1)'}`,color:'var(--accent,#FF6B35)',border:'1px solid rgba(255,107,53,.25)',padding:'1px 8px',borderRadius:'20px',fontFamily:"'JetBrains Mono',monospace",fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em'}}>{cat}</span>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',color:'#00D4FF',background:'rgba(0,212,255,.08)',border:'1px solid rgba(0,212,255,.2)',padding:'4px 10px',borderRadius:'20px'}}>
            {sessions.toLocaleString('en-IN')} sessions
          </div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'10px',color:'#475569',padding:'4px 8px',background:'rgba(255,255,255,.03)',border:'1px solid #1e2a45',borderRadius:'20px'}}>
            live · 2s tick
          </div>
        </div>
      </div>

      <div style={{display:'flex',gap:'12px',flexWrap:'wrap',marginBottom:'16px'}}>
        {STRATEGIES.map((st,i)=>{
          const ctr   = ctrs[st]
          const hist  = history[st] || []
          const pct   = Math.min((ctr/barScaleMax)*100, 100)
          const isWin = st === winner
          const isDip = st === dipTarget
          const isActive = activeSt === st
          const accentCol = accentColors[st]
          const prev10 = hist.length >= 2 ? hist[hist.length-2] : ctr
          const delta = +(ctr - prev10).toFixed(2)
          const deltaCol = delta > 0 ? '#4ade80' : delta < 0 ? '#f87171' : '#64748b'

          return (
            <div key={st} style={{
              flex:1, minWidth:'190px',
              background: isDip  ? 'rgba(248,113,113,.04)'
                        : isActive ? 'rgba(255,107,53,.06)'
                        : 'rgba(255,255,255,.02)',
              border:`1.5px solid ${
                isDip   ? 'rgba(248,113,113,.4)'
                : isActive ? 'var(--accent,#FF6B35)'
                : isWin  ? 'rgba(255,215,0,.35)'
                : '#1e2a45'
              }`,
              borderRadius:'10px', padding:'14px', transition:'all .4s',
              position:'relative', overflow:'hidden'
            }}>
              {/* dip flash overlay */}
              {isDip && <div style={{position:'absolute',inset:0,background:'rgba(248,113,113,.06)',borderRadius:'10px',pointerEvents:'none',animation:'hexPulseAnim .5s ease-in-out 2'}}/>}

              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'8px'}}>
                <div>
                  <div style={{color:'#64748b',fontSize:'9px',fontFamily:"'JetBrains Mono',monospace",letterSpacing:'.06em',marginBottom:'2px'}}>VARIANT {String.fromCharCode(65+i)}</div>
                  <div style={{color:'#e2e8f0',fontWeight:700,fontSize:'13px'}}>{STRATEGY_FULL[st]}</div>
                </div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'2px'}}>
                  {isWin  && <span style={{fontSize:'16px'}}>🏆</span>}
                  {isDip  && <span style={{fontSize:'11px',color:'#f87171',fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>DIP</span>}
                </div>
              </div>

              {/* CTR number + delta */}
              <div style={{display:'flex',alignItems:'flex-end',gap:'6px',marginBottom:'4px'}}>
                <span style={{fontSize:'28px',fontWeight:800,color:isWin?'#FFD700':isDip?'#f87171':'#F1F5F9',fontFamily:"'Syne',sans-serif",lineHeight:1,transition:'color .4s'}}>
                  {ctr.toFixed(1)}
                </span>
                <span style={{color:'#64748b',fontSize:'13px',marginBottom:'3px'}}>% CTR</span>
                <span style={{fontSize:'10px',color:deltaCol,marginBottom:'4px',fontFamily:"'JetBrains Mono',monospace",fontWeight:700,marginLeft:'auto'}}>
                  {delta>0?'+':''}{delta.toFixed(2)}
                </span>
              </div>

              {/* Sparkline */}
              <div style={{marginBottom:'10px'}}>
                <Sparkline data={hist.length>=2?hist:[ctr,ctr]} color={accentCol} isWin={isWin}/>
              </div>

              {/* Progress bar */}
              <div style={{height:'5px',background:'#1e2a45',borderRadius:'3px',overflow:'hidden',marginBottom:'10px'}}>
                <div className="race-bar" style={{height:'100%',borderRadius:'3px',transition:'width 1.5s cubic-bezier(.16,1,.3,1)',background:isWin?'#FFD700':isDip?'#f87171':accentCol,width:`${pct}%`}}/>
              </div>

              <button onClick={()=>setActiveSt(isActive?null:st)} style={{width:'100%',padding:'6px',borderRadius:'6px',border:`1px solid ${isActive?'var(--accent,#FF6B35)':'#2d3748'}`,background:isActive?'rgba(255,107,53,.1)':'transparent',color:isActive?'var(--accent,#FF6B35)':'#64748b',fontSize:'11px',fontWeight:700,cursor:'pointer',transition:'all .2s',fontFamily:"'JetBrains Mono',monospace"}}>
                {isActive?'✓ ACTIVE':'SET AS ACTIVE'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Footer status line */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'8px'}}>
        {winner
          ? <p style={{color:'#64748b',fontSize:'11px',fontFamily:"'JetBrains Mono',monospace",margin:0}}>
              🏆 <span style={{color:'#FFD700'}}>{STRATEGY_FULL[winner]}</span> leading by{' '}
              <span style={{color:'#FFD700'}}>+{(maxVal-Math.min(...vals.filter(v=>v!==maxVal))).toFixed(1)}%</span>
            </p>
          : <p style={{color:'#64748b',fontSize:'11px',fontFamily:"'JetBrains Mono',monospace",margin:0,fontStyle:'italic'}}>No clear leader yet — race is close</p>
        }
        <span style={{fontSize:'10px',color:'#374151',fontFamily:"'JetBrains Mono',monospace"}}>clamp [{CTR_MIN}%–{CTR_MAX}%] · dip every 8–12s</span>
      </div>
    </div>
  )
}

/* ============================================================
   DEAL INPUT FORM (Feature 9: merchant theming)
   ============================================================ */
function DealInputForm({ onSubmit, isProcessing, onMerchantChange }) {
  const [form, setForm] = useState({
    merchant_id:'',merchant_name:'',category:'food',
    discount_value:'',discount_type:'percentage',
    expiry_timestamp:'',min_order_value:'',max_redemptions:'',exclusive_flag:false
  })

  const theme = getTheme(form.merchant_name)
  const known = MERCHANT_THEME[form.merchant_name?.toLowerCase().replace(/\s/g,'')]

  const load = (key) => {
    setForm({...SAMPLE_DEALS[key]})
    onMerchantChange(SAMPLE_DEALS[key].merchant_name)
  }

  const handleChange = (upd) => {
    const next={...form,...upd}
    setForm(next)
    onMerchantChange(next.merchant_name)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({...form,discount_value:Number(form.discount_value)||0,min_order_value:Number(form.min_order_value)||0,max_redemptions:Number(form.max_redemptions)||0})
  }

  const inputStyle={padding:'9px 12px',borderRadius:'7px',border:'1px solid #2d3748',background:'rgba(255,255,255,.04)',color:'#E2E8F0',fontSize:'12px',outline:'none',width:'100%',fontFamily:"'JetBrains Mono',monospace",transition:'border-color .2s'}
  const labelStyle={color:'#64748b',fontSize:'10px',fontWeight:700,letterSpacing:'.06em',marginBottom:'4px',display:'block',fontFamily:"'JetBrains Mono',monospace"}

  return (
    <div style={{background:'#111827',border:'1px solid #1e2a45',borderRadius:'12px',padding:'20px'}}>
      {/* Merchant identity card */}
      {known && (
        <div style={{background:`${theme.accent}15`,border:`1px solid ${theme.accent}44`,borderRadius:'8px',padding:'10px 14px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'10px'}}>
          <div style={{width:'32px',height:'32px',borderRadius:'8px',background:theme.accent,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,color:'white',fontSize:'14px',flexShrink:0}}>{form.merchant_name.charAt(0)}</div>
          <div>
            <div style={{color:theme.accent,fontWeight:700,fontSize:'13px',fontFamily:"'Syne',sans-serif"}}>{form.merchant_name}</div>
            <div style={{color:'#64748b',fontSize:'10px',fontFamily:"'JetBrains Mono',monospace"}}>{form.category}</div>
          </div>
        </div>
      )}

      <h2 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'16px',color:'#F1F5F9',margin:'0 0 14px'}}>Deal Input</h2>

      {/* Quick fill */}
      <div style={{display:'flex',gap:'6px',marginBottom:'14px',flexWrap:'wrap'}}>
        <span style={{color:'#475569',fontSize:'10px',alignSelf:'center',fontFamily:"'JetBrains Mono',monospace"}}>QUICK FILL →</span>
        {Object.entries(SAMPLE_DEALS).map(([key,d])=>(
          <button key={key} onClick={()=>load(key)} style={{padding:'5px 10px',borderRadius:'6px',border:`1px solid ${MERCHANT_THEME[key]?.accent||'#374151'}44`,background:`${MERCHANT_THEME[key]?.accent||'#FF6B35'}12`,color:MERCHANT_THEME[key]?.accent||'#94a3b8',fontSize:'11px',fontWeight:700,cursor:'pointer',transition:'all .2s',fontFamily:"'JetBrains Mono',monospace"}}>
            {d.merchant_name}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:'10px'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
          <div>
            <label style={labelStyle}>MERCHANT NAME *</label>
            <input type="text" placeholder="e.g. Zomato" value={form.merchant_name}
              onChange={e=>handleChange({merchant_name:e.target.value,merchant_id:e.target.value.toLowerCase().replace(/\s+/g,'_')})}
              style={{...inputStyle,borderColor:form.merchant_name?`${theme.accent}66`:'#2d3748'}} required/>
          </div>
          <div>
            <label style={labelStyle}>CATEGORY</label>
            <select value={form.category} onChange={e=>handleChange({category:e.target.value})} style={inputStyle}>
              {['food','travel','electronics','fashion','health','beauty'].map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
          <div>
            <label style={labelStyle}>DISCOUNT VALUE *</label>
            <input type="number" placeholder="50" value={form.discount_value} onChange={e=>handleChange({discount_value:e.target.value})} style={inputStyle} required/>
          </div>
          <div>
            <label style={labelStyle}>TYPE</label>
            <select value={form.discount_type} onChange={e=>handleChange({discount_type:e.target.value})} style={inputStyle}>
              <option value="percentage">Percentage (%)</option>
              <option value="flat">Flat (INR ₹)</option>
              <option value="bogo">BOGO</option>
            </select>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
          <div>
            <label style={labelStyle}>MIN ORDER (INR)</label>
            <input type="number" placeholder="299" value={form.min_order_value} onChange={e=>handleChange({min_order_value:e.target.value})} style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>MAX REDEMPTIONS</label>
            <input type="number" placeholder="10000" value={form.max_redemptions} onChange={e=>handleChange({max_redemptions:e.target.value})} style={inputStyle}/>
          </div>
        </div>
        <div>
          <label style={labelStyle}>EXPIRY DATE/TIME</label>
          <input type="datetime-local" value={form.expiry_timestamp?form.expiry_timestamp.slice(0,16):''} onChange={e=>handleChange({expiry_timestamp:new Date(e.target.value).toISOString()})} style={inputStyle}/>
        </div>
        <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer'}}>
          <input type="checkbox" checked={form.exclusive_flag} onChange={e=>handleChange({exclusive_flag:e.target.checked})} style={{accentColor:'var(--accent,#FF6B35)',width:'14px',height:'14px'}}/>
          <span style={{color:'#94a3b8',fontSize:'12px'}}>Exclusive to GrabOn</span>
        </label>
        <button type="submit" disabled={isProcessing||!form.merchant_name||!form.discount_value} className="btn-accent"
          style={{padding:'13px',borderRadius:'8px',border:'none',color:'white',fontWeight:800,fontSize:'14px',cursor:'pointer',marginTop:'4px',fontFamily:"'Syne',sans-serif",letterSpacing:'.05em',opacity:isProcessing||!form.merchant_name||!form.discount_value?.5:1}}>
          {isProcessing?'⏳  DISTRIBUTING...':'⚡  DISTRIBUTE DEAL'}
        </button>
      </form>
    </div>
  )
}

/* ============================================================
   PIPELINE PROGRESS FEED
   ============================================================ */
function ProgressFeed({ events }) {
  const bottomRef = useRef(null)
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}) },[events])
  const lvlColor = {info:'#00D4FF',success:'#4ade80',error:'#f87171',loading:'#FF6B35',warning:'#fbbf24'}
  const lvlPfx = {info:'INFO ',success:'✓    ',error:'✕    ',loading:'...  ',warning:'WARN '}
  return (
    <div style={{background:'#0D1117',border:'1px solid #1a2238',borderRadius:'12px',padding:'16px',fontFamily:"'JetBrains Mono',monospace"}}>
      <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}>
        <h3 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:'14px',color:'#F1F5F9',margin:0}}>Pipeline Log</h3>
        {events.length>0&&<div style={{width:'6px',height:'6px',borderRadius:'50%',background:'#4ade80',animation:'hexPulseAnim 1.5s ease-in-out infinite'}}/>}
      </div>
      <div style={{maxHeight:'200px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'3px'}}>
        {events.length===0 ? (
          <span style={{color:'#374151',fontSize:'11px'}}>_ awaiting deal submission</span>
        ) : events.map((e,i)=>(
          <div key={i} style={{display:'flex',gap:'8px',fontSize:'11px',lineHeight:'1.5'}}>
            <span style={{color:'#374151',flexShrink:0}}>{new Date().toLocaleTimeString('en-IN',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
            <span style={{color:lvlColor[e.type]||'#64748b',flexShrink:0}}>{lvlPfx[e.type]||'     '}</span>
            <span style={{color:e.type==='error'?'#f87171':e.type==='success'?'#4ade80':'#94a3b8',flex:1}}>{e.message}</span>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>
    </div>
  )
}

/* ============================================================
   MAIN APP
   ============================================================ */
export default function App() {
  const [dealId, setDealId] = useState(null)
  const [merchant, setMerchant] = useState('')
  const [category, setCategory] = useState('food')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [progressEvents, setProgressEvents] = useState([])
  const [variants, setVariants] = useState(null)
  const [deliveries, setDeliveries] = useState([])
  const [summary, setSummary] = useState(null)
  const [pastDeals, setPastDeals] = useState([])
  const [processingKey, setProcessingKey] = useState(0)
  const [currentDeal, setCurrentDeal] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)
  const eventSourceRef = useRef(null)
  const wsRef = useRef(null)
  const theme = getTheme(merchant)

  // Inject global CSS
  useEffect(()=>{
    const style = document.createElement('style')
    style.textContent = GLOBAL_CSS
    document.head.appendChild(style)
    return ()=>{ try{document.head.removeChild(style)}catch(e){} }
  },[])

  // Apply merchant CSS variables
  useEffect(()=>{
    document.documentElement.style.setProperty('--accent', theme.accent)
    document.documentElement.style.setProperty('--accent-glow', theme.glow)
    document.documentElement.style.setProperty('--accent-dark', theme.accent)
  },[theme])

  // Load past deals
  useEffect(()=>{
    fetch(`${API_BASE}/api/deals`).then(r=>r.json()).then(setPastDeals).catch(()=>{})
  },[dealId])

  // WebSocket — permanent connection for MCP live push
  useEffect(()=>{
    const WS_URL = 'ws://localhost:3002'
    let retryTimer = null
    let active = true
    const connect = () => {
      if (!active) return
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      ws.onopen  = () => { if (active) setWsConnected(true) }
      ws.onclose = () => {
        setWsConnected(false)
        wsRef.current = null
        if (active) retryTimer = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type !== 'deal_complete') return
          const d = msg
          setDealId(d.deal_id)
          setMerchant(d.merchant_name || d.merchant || '')
          if (d.category) setCategory(d.category)
          setVariants(d.variants || null)
          setDeliveries(d.deliveries || [])
          setSummary(d.summary || null)
          setProgressEvents(d.progress || [])
          setCurrentDeal(d)
          setIsComplete(true)
          setIsProcessing(false)
          setProcessingKey(k => k + 1)
          setPastDeals(prev => {
            if (prev.find(p => p.deal_id === d.deal_id)) return prev
            return [{ deal_id: d.deal_id, merchant: d.merchant_name || d.merchant, category: d.category, status: 'completed', created_at: d.created_at, total_variants: d.validation?.total_variants || 54, delivery_summary: d.summary, via_mcp: true }, ...prev]
          })
        } catch(_) {}
      }
    }
    connect()
    return () => { active = false; clearTimeout(retryTimer); if (wsRef.current) wsRef.current.close() }
  },[])

  const connectSSE = useCallback((id)=>{
    if (eventSourceRef.current) eventSourceRef.current.close()
    const src = new EventSource(`${API_BASE}/api/deals/${id}/stream`)
    eventSourceRef.current = src
    src.addEventListener('progress', e=>setProgressEvents(prev=>[...prev,JSON.parse(e.data)]))
    src.addEventListener('variants', e=>{ const d=JSON.parse(e.data); setVariants(d.variants) })
    src.addEventListener('delivery', e=>{
      const d=JSON.parse(e.data)
      setDeliveries(prev=>{
        const idx=prev.findIndex(x=>x.delivery_id===d.delivery_id)
        if(idx>=0){ const u=[...prev]; u[idx]=d; return u }
        return [...prev,d]
      })
    })
    src.addEventListener('complete', e=>{ const d=JSON.parse(e.data); if(d.summary) setSummary(d.summary); setIsProcessing(false); setIsComplete(true); src.close() })
    src.onerror=()=>{ setIsProcessing(false); src.close() }
  },[])

  const runPipeline = useCallback(async(params)=>{
    setProgressEvents([]); setVariants(null); setDeliveries([]); setSummary(null); setIsComplete(false)
    setIsProcessing(true); setProcessingKey(k=>k+1)
    try {
      const res=await fetch(`${API_BASE}/api/distribute`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)})
      const data=await res.json()
      if (data.deal_id) { setDealId(data.deal_id); setCurrentDeal({...params,deal_id:data.deal_id}); connectSSE(data.deal_id) }
      else { setIsProcessing(false); setProgressEvents([{type:'error',message:data.error||'Pipeline failed to start'}]) }
    } catch(err) {
      setIsProcessing(false)
      setProgressEvents([{type:'error',message:`Connection error: ${err.message}. Is the API server running on port 3002?`}])
    }
  },[connectSSE])

  const handleTerminalCommand = useCallback((parsed, raw)=>{
    if (Object.keys(parsed).length>0) runPipeline(parsed)
    else setProgressEvents([{type:'warning',message:`Could not parse: "${raw}" — try: "Zomato 50% off above ₹299"`}])
  },[runPipeline])

  const handleMerchantChange = useCallback((name)=>{
    setMerchant(name||'')
  },[])

  const loadDeal = async(id)=>{
    setDealId(id); setProgressEvents([]); setVariants(null); setDeliveries([]); setSummary(null)
    try {
      const res=await fetch(`${API_BASE}/api/deals/${id}`); const d=await res.json()
      setMerchant(d.merchant||''); setProgressEvents(d.progress||[]); setVariants(d.variants); setDeliveries(d.deliveries||[]); setSummary(d.summary); setCurrentDeal(d)
      if(d.category) setCategory(d.category)
    } catch(err) { setProgressEvents([{type:'error',message:`Failed to load deal: ${err.message}`}]) }
  }

  const handleFormSubmit = (params)=>{
    setMerchant(params.merchant_name)
    setCategory(params.category||'food')
    runPipeline(params)
  }

  return (
    <div style={{minHeight:'100vh',background:'#0A0F1E',color:'#E2E8F0'}}>
      {/* Feature 8: Terminal Command Bar */}
      <TerminalCommandBar onCommand={handleTerminalCommand} merchantName={merchant} mcpLive={wsConnected}/>

      {/* Header */}
      <header style={{background:'#0D1117',borderBottom:'1px solid #1a2238',padding:'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'12px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <div style={{width:'40px',height:'40px',borderRadius:'10px',background:'var(--accent,#FF6B35)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 0 20px var(--accent-glow,rgba(255,107,53,.4))'}}>
            <span style={{color:'white',fontWeight:800,fontSize:'18px',fontFamily:"'Syne',sans-serif"}}>G</span>
          </div>
          <div>
            <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'18px',color:'#F1F5F9',margin:0,letterSpacing:'.02em'}}>GrabOn Deal Distributor</h1>
            <p style={{color:'#374151',fontSize:'10px',margin:0,fontFamily:"'JetBrains Mono',monospace"}}>Multi-Channel MCP · 6 channels × 3 strategies × 3 languages</p>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
          {dealId&&<code style={{color:'#00D4FF',fontSize:'10px',background:'rgba(0,212,255,.08)',border:'1px solid rgba(0,212,255,.2)',padding:'4px 10px',borderRadius:'6px',fontFamily:"'JetBrains Mono',monospace",animation:'glowPulse 3s ease-in-out infinite'}}>{dealId.slice(0,8)}...</code>}
          {variants&&currentDeal&&(
            <button onClick={()=>exportDealPackage(variants,currentDeal)} className="btn-accent" style={{padding:'7px 14px',borderRadius:'7px',border:'none',color:'white',fontSize:'11px',fontWeight:700,cursor:'pointer',fontFamily:"'JetBrains Mono',monospace",letterSpacing:'.04em'}}>
              ⬇ EXPORT PACKAGE
            </button>
          )}
        </div>
      </header>

      {/* Past deals */}
      {pastDeals.length>0&&(
        <div style={{background:'#0D1117',borderBottom:'1px solid #1a2238',padding:'8px 24px',display:'flex',gap:'6px',alignItems:'center',overflowX:'auto'}}>
          <span style={{color:'#374151',fontSize:'10px',fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>RECENT →</span>
          {pastDeals.slice(0,6).map(d=>(
            <button key={d.deal_id} onClick={()=>loadDeal(d.deal_id)}
              style={{padding:'4px 10px',borderRadius:'4px',border:`1px solid ${d.deal_id===dealId?'var(--accent,#FF6B35)':'#2d3748'}`,background:d.deal_id===dealId?'rgba(255,107,53,.1)':'transparent',color:d.deal_id===dealId?'var(--accent,#FF6B35)':'#64748b',fontSize:'10px',fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',fontFamily:"'JetBrains Mono',monospace",transition:'all .2s'}}>
              {d.merchant||'deal'} ({d.status?.slice(0,4)})
            </button>
          ))}
        </div>
      )}

      {/* Main layout */}
      <main style={{maxWidth:'1440px',margin:'0 auto',padding:'20px',display:'grid',gridTemplateColumns:'340px 1fr',gap:'16px'}}>
        {/* Left column */}
        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <DealInputForm onSubmit={handleFormSubmit} isProcessing={isProcessing} onMerchantChange={handleMerchantChange}/>
          <ProgressFeed events={progressEvents}/>
        </div>

        {/* Right column */}
        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          {/* DNA + Copy side by side */}
          <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:'14px',alignItems:'start'}}>
            <DealDNAVisualizer isProcessing={isProcessing} isComplete={isComplete} processingKey={processingKey}/>
            <OutputGrid variants={variants} merchant={merchant} category={category} isProcessing={isProcessing} dealMeta={currentDeal}/>
          </div>
          {/* A/B Race */}
          <ABTestRace channel="whatsapp" variants={variants} category={category}/>
          {/* Hex Grid */}
          <HexDeliveryGrid deliveries={deliveries} isProcessing={isProcessing}/>
        </div>
      </main>

      <footer style={{textAlign:'center',padding:'24px',color:'#1e2a45',fontSize:'11px',fontFamily:"'JetBrains Mono',monospace",borderTop:'1px solid #0D1117',marginTop:'20px'}}>
        GrabOn Vibe Coder Challenge 2025 — Project 06: Multi-Channel Deal Distribution MCP · Mission Control v2.0
      </footer>
    </div>
  )
}
