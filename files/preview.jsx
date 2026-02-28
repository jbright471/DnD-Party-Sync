import { useState, useEffect, useRef } from "react";

// ─── Google Fonts injected ────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.href = "https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap";
fontLink.rel = "stylesheet";
if (!document.querySelector('link[href*="Rajdhani"]')) document.head.appendChild(fontLink);

// ─── Styles ───────────────────────────────────────────────────────────────────
const styleEl = document.createElement("style");
styleEl.textContent = `
  @keyframes conc-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0.4)}50%{box-shadow:0 0 0 10px rgba(245,158,11,0)}}
  @keyframes fadein { from{opacity:0;transform:translateY(-6px) scale(0.97)}to{opacity:1;transform:none}}
  @keyframes hpflash-damage { 0%{background:#ef444422}100%{background:transparent}}
  @keyframes hpflash-heal { 0%{background:#22c55e22}100%{background:transparent}}
  .conc-btn:hover{filter:brightness(1.2)}
  .conc-btn:active{transform:scale(0.97)}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #060a10; }
`;
document.head.appendChild(styleEl);

// ─── Constants ────────────────────────────────────────────────────────────────
const CONDITION_META = {
  blinded:       { icon: "◎", color: "#94a3b8", label: "Blinded" },
  charmed:       { icon: "♥", color: "#f472b6", label: "Charmed" },
  frightened:    { icon: "!", color: "#fbbf24", label: "Frightened" },
  grappled:      { icon: "⊕", color: "#a78bfa", label: "Grappled" },
  poisoned:      { icon: "✦", color: "#4ade80", label: "Poisoned" },
  prone:         { icon: "↘", color: "#fb923c", label: "Prone" },
  restrained:    { icon: "⊗", color: "#f97316", label: "Restrained" },
  stunned:       { icon: "~", color: "#38bdf8", label: "Stunned" },
  unconscious:   { icon: "●", color: "#f87171", label: "Unconscious" },
  paralyzed:     { icon: "‖", color: "#60a5fa", label: "Paralyzed" },
  invisible:     { icon: "◇", color: "#c084fc", label: "Invisible" },
};

function getCond(c) {
  return CONDITION_META[c?.toLowerCase()] || { icon: "?", color: "#94a3b8", label: c };
}

function getHpColor(pct) {
  if (pct > 0.6) return "#22c55e";
  if (pct > 0.3) return "#f59e0b";
  if (pct > 0)   return "#ef4444";
  return "#7f1d1d";
}

function formatClasses(classes = []) {
  return classes.map(c => `${c.name.slice(0,3).toUpperCase()} ${c.level}`).join(" / ");
}

// ─── CharacterCard ────────────────────────────────────────────────────────────
function CharacterCard({ character, prevHp }) {
  const { name, classes=[], currentHp, maxHp, tempHp=0, ac, conditions=[], concentratingOn=null, spellSlotsMax={}, spellSlotsUsed={}, deathSaves } = character;
  const hpPct = maxHp > 0 ? currentHp / maxHp : 0;
  const hpColor = getHpColor(hpPct);
  const isDowned = currentHp === 0;
  const hasTempHp = tempHp > 0;
  const [flash, setFlash] = useState(null);
  const slotLevels = Object.keys(spellSlotsMax).sort();

  useEffect(() => {
    if (prevHp !== null && prevHp !== currentHp) {
      setFlash(currentHp < prevHp ? "damage" : "heal");
      const t = setTimeout(() => setFlash(null), 700);
      return () => clearTimeout(t);
    }
  }, [currentHp]);

  return (
    <div style={{
      position: "relative",
      background: isDowned ? "#1a0505" : "#0d1117",
      border: `1px solid ${isDowned ? "#7f1d1d" : concentratingOn ? "#f59e0b44" : "#1e2d3d"}`,
      clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))",
      padding: "15px 16px",
      fontFamily: "'Rajdhani', sans-serif",
      minWidth: 260,
      transition: "border-color 0.3s, background 0.3s",
      animation: flash ? `${flash === "damage" ? "hpflash-damage" : "hpflash-heal"} 0.7s ease` : "none",
    }}>
      {/* Corner */}
      <div style={{ position:"absolute",top:0,right:0,width:14,height:14,
        background: isDowned ? "#7f1d1d" : concentratingOn ? "#f59e0b" : "#1e2d3d",
        clipPath:"polygon(100% 0,100% 100%,0 0)",transition:"background 0.3s" }} />

      {/* Header */}
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10 }}>
        <div>
          <div style={{ fontSize:16,fontWeight:700,letterSpacing:"0.05em",color:isDowned?"#ef4444":"#e2e8f0",textTransform:"uppercase" }}>
            {name}
          </div>
          <div style={{ fontSize:10,color:"#475569",letterSpacing:"0.1em",fontFamily:"'JetBrains Mono',monospace" }}>
            {formatClasses(classes)}
          </div>
        </div>
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",background:"#0a1628",border:"1px solid #1e2d3d",padding:"3px 9px",minWidth:42 }}>
          <div style={{ fontSize:19,fontWeight:700,lineHeight:1,color:"#f0a500",fontFamily:"'JetBrains Mono',monospace" }}>{ac}</div>
          <div style={{ fontSize:8,color:"#475569",letterSpacing:"0.12em" }}>AC</div>
        </div>
      </div>

      {/* HP */}
      <div style={{ marginBottom:8 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5 }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:22,fontWeight:700,color:hpColor,transition:"color 0.4s",lineHeight:1 }}>
            {currentHp}
            <span style={{ color:"#334155",fontSize:14 }}>/{maxHp}</span>
            {hasTempHp && <span style={{ fontSize:13,color:"#38bdf8",marginLeft:6 }}>+{tempHp}</span>}
          </div>
          {isDowned && deathSaves && (
            <div style={{ display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end" }}>
              <div style={{ display:"flex",gap:3 }}>
                {[0,1,2].map(i=><div key={i} style={{ width:7,height:7,borderRadius:"50%",border:"1px solid #22c55e",background:i<deathSaves.successes?"#22c55e":"transparent" }} />)}
              </div>
              <div style={{ display:"flex",gap:3 }}>
                {[0,1,2].map(i=><div key={i} style={{ width:7,height:7,borderRadius:"50%",border:"1px solid #ef4444",background:i<deathSaves.failures?"#ef4444":"transparent" }} />)}
              </div>
            </div>
          )}
        </div>
        <div style={{ height:4,background:"#0f172a",position:"relative",overflow:"hidden" }}>
          <div style={{ position:"absolute",left:0,top:0,bottom:0,width:`${hpPct*100}%`,background:hpColor,transition:"width 0.5s cubic-bezier(0.4,0,0.2,1),background 0.4s",boxShadow:`0 0 6px ${hpColor}88` }} />
          {hasTempHp && <div style={{ position:"absolute",right:0,top:0,bottom:0,width:`${Math.min((tempHp/maxHp)*100,100-hpPct*100)}%`,background:"#38bdf8",opacity:0.7 }} />}
        </div>
      </div>

      {/* Conditions */}
      {conditions.length > 0 && (
        <div style={{ display:"flex",flexWrap:"wrap",gap:4,marginBottom:8 }}>
          {conditions.map(cond => {
            const m = getCond(cond);
            return (
              <div key={cond} title={m.label} style={{ display:"flex",alignItems:"center",gap:3,padding:"2px 6px",background:`${m.color}18`,border:`1px solid ${m.color}55`,fontSize:10,letterSpacing:"0.06em",color:m.color,fontWeight:600,textTransform:"uppercase",fontFamily:"'Rajdhani',sans-serif" }}>
                <span style={{ fontSize:11 }}>{m.icon}</span>{m.label}
              </div>
            );
          })}
        </div>
      )}

      {/* Concentration */}
      {concentratingOn && (
        <div style={{ display:"flex",alignItems:"center",gap:6,padding:"4px 8px",border:"1px solid #f59e0b44",borderLeft:"2px solid #f59e0b",marginBottom:slotLevels.length>0?8:0 }}>
          <span style={{ color:"#f59e0b",fontSize:10 }}>◉</span>
          <span style={{ fontSize:11,color:"#f59e0b",letterSpacing:"0.08em",fontFamily:"'JetBrains Mono',monospace",textTransform:"uppercase" }}>CONC: {concentratingOn}</span>
        </div>
      )}

      {/* Spell slots */}
      {slotLevels.length > 0 && (
        <div style={{ display:"flex",gap:8,paddingTop:8,borderTop:"1px solid #1e2d3d" }}>
          {slotLevels.map(lvl => {
            const max = spellSlotsMax[lvl]||0;
            const used = spellSlotsUsed[lvl]||0;
            const rem = max-used;
            return (
              <div key={lvl} style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:2 }}>
                <div style={{ display:"flex",gap:2 }}>
                  {Array.from({length:max}).map((_,i)=>(
                    <div key={i} style={{ width:6,height:6,background:i<rem?"#a78bfa":"#1e2d3d",border:"1px solid #2d1b69",transition:"background 0.2s" }} />
                  ))}
                </div>
                <span style={{ fontSize:8,color:"#334155",fontFamily:"'JetBrains Mono',monospace" }}>L{lvl}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── InitiativeTracker ────────────────────────────────────────────────────────
function InitiativeTracker({ entities=[], roundNumber=1, onNextTurn, onEndEncounter, isGm=false }) {
  const activeEntity = entities.find(e=>e.is_active);
  return (
    <div style={{ background:"#080c12",border:"1px solid #1e2d3d",fontFamily:"'Rajdhani',sans-serif",width:"100%" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderBottom:"1px solid #1e2d3d",background:"#0a1020" }}>
        <div>
          <div style={{ fontSize:10,color:"#475569",letterSpacing:"0.2em",textTransform:"uppercase",fontFamily:"'JetBrains Mono',monospace" }}>INITIATIVE</div>
          <div style={{ fontSize:15,fontWeight:700,color:"#f0a500",letterSpacing:"0.08em" }}>ROUND {roundNumber}</div>
        </div>
        {activeEntity && (
          <div style={{ textAlign:"right",padding:"4px 8px",border:"1px solid #f0a50044",background:"#f0a50011" }}>
            <div style={{ fontSize:9,color:"#f0a500",letterSpacing:"0.15em" }}>ACTIVE</div>
            <div style={{ fontSize:13,fontWeight:700,color:"#e2e8f0",textTransform:"uppercase" }}>{activeEntity.entity_name}</div>
          </div>
        )}
      </div>

      <div style={{ padding:"10px 10px 6px" }}>
        {entities.map((entity,i) => {
          const { entity_name,entity_type,initiative,current_hp,max_hp,ac,is_active,conditions=[],concentrating_on } = entity;
          const isPC = entity_type==="pc";
          const isDowned = current_hp===0&&max_hp>0;
          const hpPct = max_hp>0?Math.max(0,current_hp/max_hp):0;
          const hpColor = getHpColor(hpPct);
          return (
            <div key={entity.id||i} style={{ display:"flex",alignItems:"stretch",gap:0,background:is_active?"#0f1c2e":isDowned?"#130808":"#0a0f16",border:`1px solid ${is_active?"#f0a50044":isDowned?"#7f1d1d33":"#1e2d3d"}`,marginBottom:4,transition:"background 0.3s",opacity:isDowned?0.7:1 }}>
              <div style={{ width:3,alignSelf:"stretch",background:is_active?"#f0a500":"transparent",flexShrink:0,boxShadow:is_active?"0 0 8px #f0a50088":"none",transition:"background 0.2s" }} />
              <div style={{ width:36,display:"flex",alignItems:"center",justifyContent:"center",borderRight:"1px solid #1e2d3d",fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:700,color:is_active?"#f0a500":"#475569",flexShrink:0 }}>{initiative}</div>
              <div style={{ flex:1,padding:"6px 9px",minWidth:0 }}>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:8 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:5,minWidth:0 }}>
                    <div style={{ width:5,height:5,borderRadius:"50%",flexShrink:0,background:isPC?"#60a5fa":"#f87171" }} />
                    <span style={{ fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:13,letterSpacing:"0.04em",color:isDowned?"#ef4444":is_active?"#e2e8f0":"#94a3b8",textTransform:"uppercase",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                      {entity_name}{isDowned&&<span style={{ color:"#7f1d1d",marginLeft:5,fontSize:10 }}>● DOWN</span>}
                    </span>
                  </div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"#f0a500",padding:"1px 5px",border:"1px solid #f0a50033",flexShrink:0 }}>AC {ac}</div>
                </div>
                <div style={{ marginTop:5,display:"flex",alignItems:"center",gap:6 }}>
                  <div style={{ flex:1,height:3,background:"#0f172a",position:"relative",minWidth:40 }}>
                    <div style={{ position:"absolute",left:0,top:0,bottom:0,width:`${hpPct*100}%`,background:hpColor,transition:"width 0.4s cubic-bezier(0.4,0,0.2,1)",boxShadow:`0 0 4px ${hpColor}88` }} />
                  </div>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:hpColor,minWidth:32,textAlign:"right" }}>{current_hp}/{max_hp}</span>
                </div>
                {concentrating_on && <div style={{ marginTop:3,fontSize:9,color:"#f59e0b",fontFamily:"'JetBrains Mono',monospace",textTransform:"uppercase" }}>◉ {concentrating_on}</div>}
                {conditions.length>0&&(
                  <div style={{ display:"flex",gap:3,flexWrap:"wrap",marginTop:3 }}>
                    {conditions.map(c=>{const m=getCond(c);return(
                      <span key={c} title={m.label} style={{ fontSize:9,color:m.color,padding:"1px 4px",border:`1px solid ${m.color}44`,background:`${m.color}12`,letterSpacing:"0.06em",fontFamily:"'Rajdhani',sans-serif",fontWeight:600,textTransform:"uppercase" }}>{m.icon} {c}</span>
                    );})}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isGm&&entities.length>0&&(
        <div style={{ display:"flex",borderTop:"1px solid #1e2d3d" }}>
          {[["Next Turn →","#f0a500",onNextTurn],["End Combat","#475569",onEndEncounter]].map(([label,color,fn],i)=>(
            <button key={label} onClick={fn} style={{ flex:1,padding:"9px 0",background:"transparent",border:"none",borderRight:i===0?"1px solid #1e2d3d":"none",color,fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:12,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer" }}
              onMouseEnter={e=>{e.currentTarget.style.background=i===0?"#f0a50011":"#ef444411";if(i===1)e.currentTarget.style.color="#ef4444"}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";if(i===1)e.currentTarget.style.color="#475569"}}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Concentration Alert ──────────────────────────────────────────────────────
function ConcentrationAlert({ check, onResolve }) {
  if (!check) return null;
  return (
    <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.8)",backdropFilter:"blur(4px)" }}>
      <div style={{ background:"#0d1117",border:"1px solid #f59e0b66",padding:"24px 28px",width:360,position:"relative",clipPath:"polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%)",animation:"fadein 0.2s ease" }}>
        <div style={{ position:"absolute",top:0,right:0,width:14,height:14,background:"#f59e0b",clipPath:"polygon(100% 0,100% 100%,0 0)" }} />
        <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:16 }}>
          <div style={{ animation:"conc-pulse 1.8s infinite",borderRadius:"50%",padding:4 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <polygon points="12,2 22,8 22,16 12,22 2,16 2,8" stroke="#f59e0b" strokeWidth="1.5" fill="#f59e0b18"/>
              <polygon points="12,2 17,8 12,14 7,8" stroke="#f59e0b" strokeWidth="1" fill="#f59e0b22"/>
              <text x="12" y="17" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#f59e0b" fontFamily="'JetBrains Mono',monospace">20</text>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:10,color:"#f59e0b",letterSpacing:"0.2em",textTransform:"uppercase",fontFamily:"'JetBrains Mono',monospace" }}>CONCENTRATION CHECK</div>
            <div style={{ fontSize:18,fontWeight:700,color:"#e2e8f0",textTransform:"uppercase",letterSpacing:"0.06em",fontFamily:"'Rajdhani',sans-serif" }}>{check.spellName}</div>
          </div>
        </div>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"center",padding:"14px 0",marginBottom:16,borderTop:"1px solid #1e2d3d",borderBottom:"1px solid #1e2d3d",gap:14 }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:48,fontWeight:700,lineHeight:1,color:"#f59e0b",fontFamily:"'JetBrains Mono',monospace" }}>{check.dc}</div>
            <div style={{ fontSize:9,color:"#475569",letterSpacing:"0.2em",marginTop:2,textTransform:"uppercase" }}>CON SAVE DC</div>
          </div>
          <div style={{ borderLeft:"1px solid #1e2d3d",paddingLeft:14,fontSize:12,color:"#64748b",maxWidth:130,lineHeight:1.5,fontFamily:"'Rajdhani',sans-serif" }}>
            Roll CON save. On failure, <strong style={{ color:"#94a3b8" }}>{check.spellName}</strong> ends.
          </div>
        </div>
        <div style={{ display:"flex",gap:8 }}>
          {[["✓ Passed","#052e16","#22c55e66","#22c55e",true],["✗ Failed","#450a0a","#ef444466","#ef4444",false]].map(([label,bg,border,color,passed])=>(
            <button key={label} className="conc-btn" onClick={()=>onResolve(passed)} style={{ flex:1,padding:"10px 0",background:bg,border:`1px solid ${border}`,color,cursor:"pointer",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:14,letterSpacing:"0.12em",textTransform:"uppercase",transition:"filter 0.15s,transform 0.1s" }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Demo App ─────────────────────────────────────────────────────────────────
const INITIAL_PARTY = [
  { id:1, name:"J", classes:[{name:"Ranger",level:5},{name:"Blood Hunter",level:3}], currentHp:68, maxHp:68, tempHp:0, ac:16, conditions:[], concentratingOn:"Hunter's Mark", spellSlotsMax:{1:4,2:2}, spellSlotsUsed:{1:1}, deathSaves:{successes:0,failures:0} },
  { id:2, name:"Theron", classes:[{name:"Paladin",level:8}], currentHp:52, maxHp:72, tempHp:12, ac:20, conditions:["frightened"], concentratingOn:null, spellSlotsMax:{1:4,2:3,3:2}, spellSlotsUsed:{1:2,2:1}, deathSaves:{successes:0,failures:0} },
  { id:3, name:"Lira", classes:[{name:"Wizard",level:8}], currentHp:18, maxHp:42, tempHp:0, ac:13, conditions:["prone","poisoned"], concentratingOn:"Hypnotic Pattern", spellSlotsMax:{1:4,2:3,3:3,4:2}, spellSlotsUsed:{1:3,2:2,3:1}, deathSaves:{successes:0,failures:0} },
  { id:4, name:"Gareth", classes:[{name:"Fighter",level:8}], currentHp:0, maxHp:76, tempHp:0, ac:17, conditions:["unconscious"], concentratingOn:null, spellSlotsMax:{}, spellSlotsUsed:{}, deathSaves:{successes:2,failures:1} },
];

const INITIAL_INITIATIVE = [
  { id:1, entity_name:"Lira",    entity_type:"pc",      initiative:22, current_hp:18, max_hp:42, ac:13, is_active:false, conditions:["prone","poisoned"], concentrating_on:"Hypnotic Pattern" },
  { id:2, entity_name:"Orc Warchief", entity_type:"monster", initiative:18, current_hp:67, max_hp:120, ac:16, is_active:true, conditions:[], concentrating_on:null },
  { id:3, entity_name:"J",       entity_type:"pc",      initiative:17, current_hp:68, max_hp:68, ac:16, is_active:false, conditions:[], concentrating_on:"Hunter's Mark" },
  { id:4, entity_name:"Theron",  entity_type:"pc",      initiative:14, current_hp:52, max_hp:72, ac:20, is_active:false, conditions:["frightened"], concentrating_on:null },
  { id:5, entity_name:"Orc Grunt", entity_type:"monster",initiative:11, current_hp:8, max_hp:22, ac:13, is_active:false, conditions:[], concentrating_on:null },
  { id:6, entity_name:"Gareth",  entity_type:"pc",      initiative:9,  current_hp:0,  max_hp:76, ac:17, is_active:false, conditions:["unconscious"], concentrating_on:null },
];

export default function App() {
  const [party, setParty] = useState(INITIAL_PARTY);
  const [initiative, setInitiative] = useState(INITIAL_INITIATIVE);
  const [round, setRound] = useState(1);
  const [concCheck, setConcCheck] = useState(null);
  const [prevHps, setPrevHps] = useState({});

  // Demo actions
  function doDamage(id, amount, type="slashing") {
    setParty(prev => prev.map(c => {
      if (c.id !== id) return c;
      setPrevHps(p => ({...p, [id]: c.currentHp}));
      const newHp = Math.max(0, c.currentHp - amount);
      // Trigger conc check if concentrating and took damage
      if (c.concentratingOn && amount > 0) {
        const dc = Math.max(10, Math.floor(amount / 2));
        setTimeout(() => setConcCheck({ characterId: id, spellName: c.concentratingOn, dc }), 400);
      }
      return { ...c, currentHp: newHp };
    }));
  }

  function doHeal(id, amount) {
    setParty(prev => prev.map(c => {
      if (c.id !== id) return c;
      setPrevHps(p => ({...p, [id]: c.currentHp}));
      return { ...c, currentHp: Math.min(c.maxHp, c.currentHp + amount) };
    }));
  }

  function handleConcResult(passed) {
    if (!passed && concCheck) {
      setParty(prev => prev.map(c =>
        c.id === concCheck.characterId ? {...c, concentratingOn: null} : c
      ));
    }
    setConcCheck(null);
  }

  function nextTurn() {
    setInitiative(prev => {
      const activeIdx = prev.findIndex(e=>e.is_active);
      const next = (activeIdx + 1) % prev.length;
      if (next === 0) setRound(r => r + 1);
      return prev.map((e,i) => ({...e, is_active: i===next}));
    });
  }

  return (
    <div style={{ minHeight:"100vh",background:"#060a10",color:"#e2e8f0",padding:20,fontFamily:"'Rajdhani',sans-serif" }}>
      
      {/* Header */}
      <div style={{ marginBottom:20,paddingBottom:16,borderBottom:"1px solid #1e2d3d" }}>
        <div style={{ fontSize:10,color:"#334155",letterSpacing:"0.3em",fontFamily:"'JetBrains Mono',monospace" }}>DND PARTY SYNC // TACTICAL VIEW</div>
        <div style={{ fontSize:22,fontWeight:700,letterSpacing:"0.08em",color:"#e2e8f0",marginTop:2 }}>COMBAT DASHBOARD</div>
      </div>

      <div style={{ display:"flex",gap:20,alignItems:"flex-start",flexWrap:"wrap" }}>
        {/* Party cards */}
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontSize:10,color:"#334155",letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:10,fontFamily:"'JetBrains Mono',monospace" }}>PARTY STATUS</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10 }}>
            {party.map(char => (
              <div key={char.id}>
                <CharacterCard character={char} prevHp={prevHps[char.id]??char.currentHp} />
                {/* Demo buttons */}
                <div style={{ display:"flex",gap:4,marginTop:4 }}>
                  {[["−10 DMG",()=>doDamage(char.id,10),"#ef4444"],["−25 DMG",()=>doDamage(char.id,25),"#dc2626"],["+15 HEAL",()=>doHeal(char.id,15),"#22c55e"]].map(([l,fn,col])=>(
                    <button key={l} onClick={fn} style={{ flex:1,padding:"4px 0",fontSize:10,fontWeight:700,letterSpacing:"0.06em",background:"transparent",border:`1px solid ${col}44`,color:col,cursor:"pointer",fontFamily:"'Rajdhani',sans-serif",transition:"background 0.15s" }}
                      onMouseEnter={e=>e.currentTarget.style.background=`${col}18`}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Initiative sidebar */}
        <div style={{ width:320,flexShrink:0 }}>
          <div style={{ fontSize:10,color:"#334155",letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:10,fontFamily:"'JetBrains Mono',monospace" }}>COMBAT ORDER</div>
          <InitiativeTracker entities={initiative} roundNumber={round} onNextTurn={nextTurn} onEndEncounter={()=>{setInitiative([]);setRound(1)}} isGm={true} />
        </div>
      </div>

      {/* Concentration check overlay */}
      <ConcentrationAlert check={concCheck} onResolve={handleConcResult} />

      {/* Instructions */}
      <div style={{ marginTop:20,paddingTop:16,borderTop:"1px solid #1e2d3d",fontSize:11,color:"#334155",fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.08em" }}>
        DEMO: Click damage/heal buttons to test HP flash animation. Damage to J or Lira triggers concentration check modal. Click "Next Turn →" to advance initiative.
      </div>
    </div>
  );
}
