import { useMemo, useState } from "react";
import mdopostLogo from "./assets/logo-mdopost.png";
import manadoPostWordmark from "./assets/logo.webp";

// ============================================
// MISSING UI COMPONENTS
// ============================================

// Masthead with logo and title

// Masthead with logo - NEGATIVE MARGIN
const Masthead = () => (
  <header className="mb-6 flex items-center justify-between gap-3 sm:mb-8 sm:gap-4">
    <div className="flex flex-shrink-0 items-center">
      {/* Logo */}
      <img
        src={mdopostLogo}
        alt="MP Logo"
        className="h-16 w-16 flex-shrink-0 rounded-xl object-contain sm:h-20 sm:w-20"
        style={{ width: '100px', height: '100px' }}
      />
      {/* Wordmark - dengan margin negatif untuk mendekat */}
      <img
        src={manadoPostWordmark}
        alt="ManadoPost.id"
        className="h-12 w-auto object-contain sm:h-16"
        style={{ 
          height: '60px',
          marginLeft: '-8px' // Mendekatkan dengan margin negatif
        }}
      />
    </div>
    <h2 className="text-sm font-semibold text-blue-950 sm:text-base">Article Quality Analyzer</h2>
  </header>
);

// Simple colored dot
const Dot = ({ className }) => (
  <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${className}`} />
);

// Warning icon (SVG)
const WarningGlyph = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
  </svg>
);

// Check icon (SVG)
const CheckGlyph = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// Chevron icon for expandable
const ChevronIcon = ({ expanded }) => (
  <svg 
    className={`h-5 w-5 transition-transform ${expanded ? 'rotate-180' : ''}`} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// Recommendation text helper
const Recommendation = ({ text }) => {
  if (!text) return null;
  return (
    <p className="text-xs text-slate-500 mt-1 italic">
      {text}
    </p>
  );
};

// Category score card component
// Category score card component - KEEP ORIGINAL COLOR
const ScoreCard = ({ category, isActive, onClick, score }) => {
  // Tentukan warna berdasarkan skor (tidak terpengaruh isActive)
  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-red-600';
  };
  
  const scoreColor = getScoreColor(score);
  
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-4 py-2 text-left transition-all ${
        isActive 
          ? 'bg-blue-900 shadow-md' 
          : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
      }`}
    >
      <span className={`text-xl font-bold ${scoreColor}`}> {/* Warna tetap sesuai skor */}
        {score}
      </span>
      <span className={`flex-1 text-sm font-medium ${isActive ? 'text-white' : 'text-slate-700'}`}>
        {category}
      </span>
      <ChevronIcon expanded={isActive} />
    </button>
  );
};

// Category overview strip with expandable panels
const CategoryOverviewStrip = ({ details, activeCategory, onSelect, layout = "grid" }) => {
  return (
    <div className="space-y-2">
      <div
        className={
          layout === "sidebar"
            ? "grid grid-cols-2 gap-2 lg:grid-cols-1"
            : "grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {details?.map((category) => (
          <ScoreCard
            key={category.name}
            category={category.name}
            score={parseInt(category.value) || 0}
            isActive={activeCategory === category.name}
            onClick={() => onSelect(category.name)}
          />
        ))}
      </div>
      
      {/* Expanded detail panel */}
      {details?.map((category) => (
        <CategoryDetail
          key={`detail-${category.name}`}
          category={category.name}
          details={category}
          isExpanded={activeCategory === category.name}
        />
      ))}
    </div>
  );
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

const verdictFromScore = (score) => {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Needs Verification";
  return "Low Quality";
};

const badgeColor = (score) => {
  if (score >= 85) return "bg-emerald-100 text-emerald-700";
  if (score >= 70) return "bg-blue-100 text-blue-700";
  if (score >= 50) return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
};

const scoreTextColor = (score) => {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
};

const scoreBarColor = (score) => {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
};

const sampleArticle = `Pemerintah Kota Manado resmi mengalokasikan anggaran sebesar Rp45 miliar untuk perbaikan jalan rusak di sejumlah kecamatan pada tahun anggaran 2026. Menurut Kepala Dinas PUPR Kota Manado, Ferry Lompoliu, anggaran tersebut akan difokuskan pada 32 ruas jalan yang dinilai paling rusak berdasarkan hasil survei lapangan bulan Mei lalu.

Banyak warga menilai perbaikan ini seharusnya sudah dilakukan sejak tahun lalu. Menurut sumber yang tidak disebutkan namanya, proyek ini rawan dikorupsi.

Proyek ini ditargetkan rampung sebelum akhir tahun 2026 dan akan diawasi langsung oleh inspektorat daerah. Beberapa pengamat kebijakan publik menyebut alokasi ini sudah tepat sasaran.`;

const weaknessStyles = {
  passive: {
    label: "Kalimat Pasif",
    dot: "bg-red-500",
    class: "border-l-4 border-red-400 bg-red-50",
  },
  complex: {
    label: "Kalimat Kompleks",
    dot: "bg-amber-500",
    class: "border-l-4 border-amber-400 bg-amber-50",
  },
  formal: {
    label: "Kata Formal Berulang",
    dot: "bg-blue-500",
    class: "border-l-4 border-blue-400 bg-blue-50",
  },
  spacing: {
    label: "Spasi Ganda",
    dot: "bg-slate-400",
    class: "border-l-4 border-slate-300 bg-slate-50",
  },
  trailing: {
    label: "Spasi Akhir Baris",
    dot: "bg-slate-400",
    class: "border-l-4 border-slate-300 bg-slate-50",
  },
  linebreak: {
    label: "Inkonsisten Line Break",
    dot: "bg-slate-400",
    class: "border-l-4 border-slate-300 bg-slate-50",
  },
  quotes: {
    label: "Tanda Kutip Non-standar",
    dot: "bg-slate-400",
    class: "border-l-4 border-slate-300 bg-slate-50",
  },
};

// Weakness styles for Struktur/Format
const strukturWeaknessStyles = {
  'lead-long': { label: "Lead Terlalu Panjang", dot: "bg-amber-500", class: "border-l-4 border-amber-400 bg-amber-50" },
  'lead-short': { label: "Lead Terlalu Pendek", dot: "bg-amber-500", class: "border-l-4 border-amber-400 bg-amber-50" },
  'heading-missing': { label: "Subjudul Kurang", dot: "bg-red-500", class: "border-l-4 border-red-400 bg-red-50" },
  'no-attribution': { label: "Tanpa Atribusi", dot: "bg-red-500", class: "border-l-4 border-red-400 bg-red-50" },
  '5w1h-incomplete': { label: "5W1H Tidak Lengkap", dot: "bg-amber-500", class: "border-l-4 border-amber-400 bg-amber-50" },
  'pyramid-weak': { label: "Piramida Terbalik Lemah", dot: "bg-amber-500", class: "border-l-4 border-amber-400 bg-amber-50" },
  'closing-issue': { label: "Masalah Penutup", dot: "bg-amber-500", class: "border-l-4 border-amber-400 bg-amber-50" },
  'paragraph-count': { label: "Paragraf Kurang", dot: "bg-amber-500", class: "border-l-4 border-amber-400 bg-amber-50" },
  'headline-long': { label: "Judul Terlalu Panjang", dot: "bg-amber-500", class: "border-l-4 border-amber-400 bg-amber-50" },
  'headline-passive': { label: "Judul Kurang Aktif", dot: "bg-amber-500", class: "border-l-4 border-amber-400 bg-amber-50" },
};

// Weakness styles for SEO & Audiens
const seoWeaknessStyles = {
  'word-count-low': { label: "Jumlah Kata Kurang", dot: "bg-red-500", class: "border-l-4 border-red-400 bg-red-50" },
  'keyword-low': { label: "Keyword Density Rendah", dot: "bg-amber-500", class: "border-l-4 border-amber-400 bg-amber-50" },
  'keyword-high': { label: "Keyword Stuffing", dot: "bg-red-500", class: "border-l-4 border-red-400 bg-red-50" },
  'no-internal-links': { label: "Tanpa Tautan Internal", dot: "bg-amber-500", class: "border-l-4 border-amber-400 bg-amber-50" },
  'fact-density-low': { label: "Fact Density Rendah", dot: "bg-amber-500", class: "border-l-4 border-amber-400 bg-amber-50" },
  'dead-paragraph': { label: "Paragraf Mati", dot: "bg-red-500", class: "border-l-4 border-red-400 bg-red-50" },
  'click-not-worthy': { label: "Judul Kurang Menarik", dot: "bg-amber-500", class: "border-l-4 border-amber-400 bg-amber-50" },
  'meta-quality-low': { label: "Lead Kurang Optimal", dot: "bg-amber-500", class: "border-l-4 border-amber-400 bg-amber-50" },
};

// Risk styles for Etika & Legalitas
const riskStyles = {
  high: { label: "Prioritas Tinggi", dot: "bg-red-500", class: "border-l-4 border-red-500 bg-red-100" },
  medium: { label: "Prioritas Sedang", dot: "bg-amber-500", class: "border-l-4 border-amber-500 bg-amber-50" },
  low: { label: "Prioritas Rendah", dot: "bg-blue-500", class: "border-l-4 border-blue-500 bg-blue-50" },
};

const WeaknessLegend = () => (
  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
    {Object.entries(weaknessStyles).map(([key, val]) => (
      <span key={key} className="flex items-center gap-1.5">
        <Dot className={val.dot} />
        {val.label}
      </span>
    ))}
  </div>
);

// ============================================
// ENHANCED WEAKNESS DISPLAY COMPONENTS
// ============================================

// Generic weakness box with styling
const WeaknessBox = ({ type, label, content, recommendation, style }) => (
  <div className={`rounded-xl p-3 mb-2 ${style?.class || 'border border-slate-200 bg-slate-50'}`}>
    <div className="flex items-start gap-2">
      <Dot className={style?.dot || 'bg-slate-400'} />
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        {content && <p className="text-xs text-slate-600 mt-1">{content}</p>}
        {recommendation && (
          <p className="text-xs text-slate-500 mt-1 italic">Rekomendasi: {recommendation}</p>
        )}
      </div>
    </div>
  </div>
);

// Collapsible weakness list
// ============================================
// ENHANCED WEAKNESS DISPLAY COMPONENTS - WITH RED HIGHLIGHT
// ============================================

// Collapsible weakness list dengan highlight merah
// Collapsible weakness list - Simple red version
// Collapsible weakness list - KEMBALI KE TAMPILAN SEMULA
const CollapsibleWeaknessList = ({ weaknesses, title, maxVisible = 5 }) => {
  const [expanded, setExpanded] = useState(false);
  
  if (!weaknesses || weaknesses.length === 0) return null;
  
  const visibleWeaknesses = expanded ? weaknesses : weaknesses.slice(0, maxVisible);
  const hasMore = weaknesses.length > maxVisible;
  
  // Determine which style map to use based on first weakness type
  const firstType = weaknesses[0]?.type || '';
  let styleMap;
  if (firstType === 'spacing' || firstType === 'trailing' || firstType === 'linebreak' || firstType === 'quotes') {
    styleMap = weaknessStyles;
  } else if (weaknesses[0]?.type === 'passive' || weaknesses[0]?.type === 'complex' || weaknesses[0]?.type === 'formal') {
    styleMap = weaknessStyles;
  } else {
    // Assume simple string weaknesses or unknown type - use generic
    styleMap = { default: { dot: 'bg-slate-400', class: 'border border-slate-200 bg-slate-50' } };
  }
  
  return (
    <div>
      {title && <h4 className="text-sm font-semibold text-slate-600 mb-2">{title}</h4>}
      <div className="space-y-2">
        {visibleWeaknesses.map((w, i) => {
          // Special rendering for spacing issues
          if (w.type === 'spacing' && w.spaceCount) {
            return (
              <div key={i} className="text-xs">
                <SpacingIssueBox issue={w} />
              </div>
            );
          }
          
          // Special rendering for trailing issues
          if (w.type === 'trailing') {
            return (
              <div key={i} className="text-xs">
                <TrailingIssueBox issue={w} />
              </div>
            );
          }
          
          // Determine style based on weakness type
          let style = styleMap[w.type] || styleMap.default || { dot: 'bg-slate-400', class: 'border border-slate-200 bg-slate-50' };
          let label = '';
          let content = '';
          let recommendation = '';
          
          if (typeof w === 'string') {
            label = w;
          } else if (w.type && styleMap[w.type]) {
            label = styleMap[w.type].label;
            content = w.note || w.text || w.context || '';
            recommendation = w.recommendation || '';
          } else {
            label = w.note || w.text || w.label || '';
            if (!label) label = JSON.stringify(w);
            content = w.context || '';
          }
          
          // For passive/complex/formal, include highlighted text
          if (w.passiveWord) {
            content = `Kalimat pasif: "${w.passiveWord}"`;
            if (w.text) content += ' - "' + w.text.slice(0, 100) + '..."';
          } else if (w.wordCount) {
            content = `Kalimat ${w.wordCount} kata (ideal ≤25)`;
          } else if (w.count) {
            content = `Muncul ${w.count}x dalam teks`;
          }
          
          return (
            <WeaknessBox
              key={i}
              type={w.type}
              label={label}
              content={content}
              recommendation={recommendation}
              style={style}
            />
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          {expanded ? 'Sembunyikan' : `Tampilkan ${weaknesses.length - maxVisible} lainnya`}
        </button>
      )}
    </div>
  );
};

// Risks section for Etika & Legalitas
const RisksSection = ({ risks }) => {
  if (!risks || risks.length === 0) return null;
  
  // Sort by priority: high first
  const sortedRisks = [...risks].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] || 1) - (order[b.priority] || 1);
  });
  
  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-red-600 mb-2">Risiko Etika</h4>
      <div className="space-y-2">
        {sortedRisks.map((risk, i) => {
          const style = riskStyles[risk.priority] || riskStyles.medium;
          return (
            <div key={i} className={`rounded-xl p-3 ${style.class}`}>
              <div className="flex items-start gap-2">
                <Dot className={style.dot} />
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {style.label}
                  </p>
                  <p className="text-sm font-medium text-slate-700">
                    {risk.type === 'defamation' && 'Risiko Fitnah'}
                    {risk.type === 'privacy' && 'Risiko Privasi'}
                    {risk.type === 'consent' && 'Risiko Izin'}
                    {risk.type !== 'defamation' && risk.type !== 'privacy' && risk.type !== 'consent' && risk.type}
                    {risk.keyword && `: "${risk.keyword}"`}
                  </p>
                  {risk.context && (
                    <p className="text-xs text-slate-600 mt-1">{risk.context}</p>
                  )}
                  {risk.detail && (
                    <p className="text-xs text-slate-500 mt-1">{risk.detail}</p>
                  )}
                  {risk.recommendation && (
                    <p className="text-xs text-blue-600 mt-2 font-medium">
                      Rekomendasi: {risk.recommendation}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Meta info section
const MetaSection = ({ meta }) => {
  if (!meta || Object.keys(meta).length === 0) return null;
  
  const formatValue = (key, value) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
    if (typeof value === 'number') return value;
    return String(value);
  };
  
  const formatKey = (key) => {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };
  
  return (
    <div className="pt-3 border-t border-slate-200 mt-4">
      <h4 className="text-xs font-semibold text-slate-400 mb-2">Detail Analisis</h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {Object.entries(meta).map(([key, value]) => (
          <div key={key} className="flex justify-between py-1">
            <span className="text-slate-500">{formatKey(key)}:</span>
            <span className="text-slate-700 font-medium">{formatValue(key, value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Notes section
// Notes section - WITH NUMBERED LIST (cleaner style)
// Notes section - WITH NUMBERED LIST (circle badge)
const NotesSection = ({ notes }) => {
  if (!notes || notes.length === 0) return null;
  
  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-slate-600 mb-2">Catatan</h4>
      <div className="space-y-2">
        {notes.map((note, i) => (
          <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <p className="text-sm text-slate-700 flex-1 leading-relaxed">{note}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// Strengths section
const StrengthsSection = ({ strengths }) => {
  if (!strengths || strengths.length === 0) return null;
  
  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-emerald-600 mb-2">Kelebihan</h4>
      <ul className="space-y-1">
        {strengths.map((s, i) => (
          <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
            <CheckGlyph className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
};

// ============================================
// ENHANCED CATEGORY DETAIL COMPONENT
// ============================================

const CategoryDetail = ({ details, isExpanded }) => {
  if (!isExpanded) return null;
  
  // Gabungkan description text ke dalam notes jika ada
  const getAllNotes = () => {
    const notes = [];
    
    if (details.text) {
      notes.push(details.text);
    }
    
    if (details.notes && details.notes.length > 0) {
      notes.push(...details.notes);
    }
    
    return notes;
  };
  
  const allNotes = getAllNotes();
  
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Semua catatan dalam satu box biru */}
      {allNotes.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-100">
          <h4 className="text-sm font-semibold text-blue-700 mb-2">Catatan</h4>
          <ol className="space-y-1 pl-5" style={{ listStyleType: 'decimal' }}>
            {allNotes.map((note, i) => (
              <li key={i} className="text-sm text-blue-800">
                {note}
              </li>
            ))}
          </ol>
        </div>
      )}
      
      {/* Risks section (for Etika) */}
      {details.risks?.length > 0 && (
        <RisksSection risks={details.risks} />
      )}
      
      {/* Strengths */}
      {details.strengths?.length > 0 && (
        <StrengthsSection strengths={details.strengths} />
      )}
      
      {/* Weaknesses - KEMBALI KE TAMPILAN SEMULA */}
      {details.weaknesses?.length > 0 && (
        <CollapsibleWeaknessList
          title="Kelemahan"
          weaknesses={details.weaknesses}
          maxVisible={5}
        />
      )}
      
      {/* Meta info */}
      {details.meta && Object.keys(details.meta).length > 0 && (
        <MetaSection meta={details.meta} />
      )}
    </div>
  );
};

// Spacing issue: shows the exact before/after text with the extra
// whitespace made visible, so the writer can see precisely what to fix.
const SpacingIssueBox = ({ issue }) => {
  const spaceDisplay = "·".repeat(issue.spaceCount);

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold text-slate-600">{issue.note}</p>

      <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-3 font-mono text-sm">
        <div className="flex flex-wrap items-center justify-center gap-1 text-xs">
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
            {issue.before}
          </span>
          <span className="rounded border border-red-300 bg-red-100 px-2 py-0.5 font-bold text-red-700">
            {spaceDisplay}
          </span>
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
            {issue.after}
          </span>
        </div>

        {issue.context && (
          <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-400">Konteks</span>
            <pre className="mt-1 whitespace-pre-wrap break-all font-sans text-slate-600">
              {issue.context}
            </pre>
          </div>
        )}
      </div>
      
      {issue.recommendation && (
        <p className="text-xs text-slate-500 mt-2 italic">
          <span className="text-blue-600 font-medium not-italic">Saran:</span> {typeof issue.recommendation === 'string' ? issue.recommendation : issue.recommendation?.text || ''}
        </p>
      )}
    </div>
  );
};

// Special component for trailing whitespace issues
const TrailingIssueBox = ({ issue }) => {
  if (!issue || typeof issue !== 'object') return null;
  
  // Helper to safely get string values
  const toString = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };
  
  return (
    <div className="border-2 border-slate-300 bg-slate-50 rounded-xl p-3 mt-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-slate-600 font-bold">{toString(issue.note)}</span>
        <span className="text-xs text-slate-500">Baris {toString(issue.line)}</span>
      </div>
      
      <div className="bg-white border border-slate-200 rounded-lg p-2 font-mono text-sm">
        <div className="flex items-end">
          <span className="text-slate-400 break-all">{toString(issue.lineContent)}</span>
          <span className="text-red-400 flex-shrink-0">· · ·</span>
        </div>
        <div className="text-center text-slate-400 text-xs mt-1">↑ spasi di akhir baris</div>
      </div>
      
      {issue.recommendation && (
        <p className="text-xs text-slate-500 mt-2 italic">
          <span className="text-blue-600 font-medium not-italic">Saran:</span> {typeof issue.recommendation === 'string' ? issue.recommendation : issue.recommendation?.text || ''}
        </p>
      )}
    </div>
  );
};

/* ---------------------------------------------------------
 * Verification flags
 * ------------------------------------------------------- */

const flagStyles = {
  high: {
    label: "Prioritas Tinggi",
    dot: "bg-red-500",
    class: "border-l-4 border-red-500 bg-red-50",
  },
  medium: {
    label: "Prioritas Sedang",
    dot: "bg-amber-500",
    class: "border-l-4 border-amber-500 bg-amber-50",
  },
  low: {
    label: "Prioritas Rendah",
    dot: "bg-blue-500",
    class: "border-l-4 border-blue-500 bg-blue-50",
  },
};

const VerificationFlagList = ({ flags, extractedBody }) => {
  if (!flags || flags.length === 0) return null;

  // Helper to find the sentence containing the flagged text
  const findSentenceWithFlag = (flag) => {
    if (!extractedBody) return null;
    
    const searchText = flag.text || flag.keyword || flag.context || '';
    if (!searchText) return null;
    
    // Split into sentences (Indonesian punctuation)
    const sentences = extractedBody.split(/[.!?]+/);
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (trimmedSentence.length > 10) {
        // Check if sentence contains the flagged text or keyword
        if (flag.keyword && trimmedSentence.toLowerCase().includes(flag.keyword.toLowerCase())) {
          return trimmedSentence;
        }
        if (flag.text && trimmedSentence.toLowerCase().includes(flag.text.toLowerCase().slice(0, 20))) {
          return trimmedSentence;
        }
      }
    }
    // Fallback: return first sentence with any keyword match
    return null;
  };

  return (
    <div className="space-y-3">
      {flags.map((flag, idx) => {
        const style = flagStyles[flag.priority] || flagStyles.medium;
        const flaggedSentence = findSentenceWithFlag(flag);
        return (
          <div
            key={idx}
            className={`rounded-xl p-3 text-sm ${style.class}`}
          >
            <div className="flex items-start gap-3">
              <Dot className={`${style.dot} mt-2`} />
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {style.label}
                </span>
                
                {/* Show the actual sentence from article */}
                {flaggedSentence && (
                  <div className="mt-2 rounded-lg bg-white/80 p-2 border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">Kalimat dalam artikel:</p>
                    <p className="text-slate-700 text-sm leading-relaxed">
                      {flaggedSentence}.
                    </p>
                  </div>
                )}
                
                <p className="mt-2 text-slate-700">
                  {flag.text && <span>&ldquo;{flag.text}&rdquo; </span>}
                  {flag.attributedTo && (
                    <span className="text-slate-500">
                      &mdash; {flag.attributedTo}
                    </span>
                  )}
                  {flag.context && !flag.text && (
                    <span>{flag.context.slice(0, 100)}</span>
                  )}
                  {flag.keyword && (
                    <span className="font-semibold text-red-700">
                      &ldquo;{flag.keyword}&rdquo;
                    </span>
                  )}
                  {flag.subject && <span>{flag.subject}</span>}
                </p>
                <Recommendation text={flag.recommendation} />
                <label className="mt-2 flex w-fit cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                  <input type="checkbox" className="rounded" />
                  <span>Sudah diverifikasi</span>
                </label>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// HOOK METER - Storytelling Quality Component
// ============================================================================

const HookMeterBadge = ({ score }) => {
  const getColor = (score) => {
    if (score >= 85) return { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Excellent' };
    if (score >= 70) return { bg: 'bg-green-100', text: 'text-green-700', label: 'Good' };
    if (score >= 55) return { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Average' };
    if (score >= 40) return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Below Avg' };
    return { bg: 'bg-red-100', text: 'text-red-700', label: 'Poor' };
  };
  
  const colors = getColor(score || 0);
  
  return (
    <span className={`rounded-full px-3 py-1 text-sm font-semibold ${colors.bg} ${colors.text}`}>
      {score}
    </span>
  );
};

const MetricBar = ({ label, score, strength, weakness }) => (
  <div className="mb-4 last:mb-0">
    <div className="mb-1 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 flex-shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
      <span className="text-sm font-semibold text-slate-600">{score}</span>
    </div>
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div 
        className="h-full rounded-full bg-slate-500 transition-all"
        style={{ width: `${score}%` }}
      />
    </div>
    {strength && (
      <p className="mt-1 text-xs text-slate-600">+ {strength}</p>
    )}
    {weakness && (
      <p className="mt-0.5 text-xs text-slate-500">- {weakness}</p>
    )}
  </div>
);

const HookMeterCard = ({ hookMeter, loading, onAnalyze }) => {
  const [expanded, setExpanded] = useState(false);
  
  if (loading) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-blue-200">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span className="text-sm text-slate-500">Menganalisis storytelling quality...</span>
        </div>
      </div>
    );
  }
  
  if (!hookMeter || hookMeter.skipped) {
    return (
      <div className="rounded-3xl bg-slate-50 p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center gap-2 text-slate-500">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">Hook Meter tidak berlaku untuk artikel ini</span>
        </div>
        <p className="mt-2 text-xs text-slate-400">{hookMeter?.reason || 'Artikel terlalu pendek atau bukan tipe naratif'}</p>
      </div>
    );
  }
  
  const getLevelColor = (level) => {
    switch (level) {
      case 'excellent': return 'text-emerald-600';
      case 'good': return 'text-green-600';
      case 'average': return 'text-amber-600';
      case 'below_average': return 'text-orange-600';
      case 'poor': return 'text-red-600';
      default: return 'text-slate-600';
    }
  };
  
  return (
    <div className="rounded-3xl bg-white shadow-sm ring-1 ring-blue-200">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-0.5 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-shrink-0 items-center justify-center rounded-xl bg-white-50 p-0.5">
            <img
              src={mdopostLogo}
              alt="MP Logo"
              width={100}
              height={100}
              className="object-contain"
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-blue-950">Hook Meter</h3>
            <p className="text-xs text-slate-500">Storytelling Quality</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <HookMeterBadge score={hookMeter.score} />
            <p className={`mt-1 text-xs font-medium ${getLevelColor(hookMeter.level)}`}>
              {hookMeter.level === 'excellent' ? 'Excellent' :
               hookMeter.level === 'good' ? 'Good' :
               hookMeter.level === 'average' ? 'Average' :
               hookMeter.level === 'below_average' ? 'Below Average' : 'Poor'}
            </p>
          </div>
          <svg className={`h-5 w-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      
      {expanded && (
        <div className="border-t border-slate-100 px-6 pb-6 pt-4">
          {/* Partial analysis warning */}
          {hookMeter._partial && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>Analisis tidak lengkap. Data di bawah berdasarkan hasil parsial.</span>
            </div>
          )}
          
          {/* Summary */}
          <p className="mb-4 text-sm text-slate-600">{hookMeter.summary}</p>
          
          {/* Metrics */}
          <div className="mb-4 rounded-xl bg-slate-50 p-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Detail Metrics</h4>
            
            {hookMeter.metrics && Object.entries(hookMeter.metrics).map(([key, metric]) => {
              const labels = {
                openingHook: { label: 'Opening Hook', icon: 'text-blue-900' },
                characterPresence: { label: 'Character Presence', icon: 'text-blue-900' },
                narrativeArc: { label: 'Narrative Arc', icon: 'text-blue-900' },
                sensoryDetails: { label: 'Sensory Details', icon: 'text-blue-900' },
                emotionalResonance: { label: 'Emotional Resonance', icon: 'text-blue-900' },
              };
              const info = labels[key] || { label: key, icon: 'text-slate-500' };
              return (
                <MetricBar 
                  key={key}
                  label={info.label} 
                  score={metric?.score || 0}
                  strength={metric?.strength}
                  weakness={metric?.weakness}
                  icon={<span className={`h-4 w-4 rounded-full ${info.icon} bg-current opacity-30`} />}
                />
              );
            })}
            
            {/* If no metrics, show fallback */}
            {(!hookMeter.metrics || Object.keys(hookMeter.metrics).length === 0) && (
              <>
                <MetricBar label="Opening Hook" score={0} icon={<span className="h-4 w-4 rounded-full bg-purple-500 opacity-30" />} />
                <MetricBar label="Character Presence" score={0} icon={<span className="h-4 w-4 rounded-full bg-pink-500 opacity-30" />} />
                <MetricBar label="Narrative Arc" score={0} icon={<span className="h-4 w-4 rounded-full bg-blue-500 opacity-30" />} />
                <MetricBar label="Sensory Details" score={0} icon={<span className="h-4 w-4 rounded-full bg-emerald-500 opacity-30" />} />
                <MetricBar label="Emotional Resonance" score={0} icon={<span className="h-4 w-4 rounded-full bg-amber-500 opacity-30" />} />
              </>
            )}
          </div>
          
          {/* Weakness Summary */}
          {hookMeter.metrics && Object.values(hookMeter.metrics).some(m => m?.weakness) && (
            <div className="mb-4 rounded-xl bg-slate-50 p-4 border border-slate-200">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Kelemahan Storytelling</h4>
              <ul className="space-y-1.5">
                {Object.entries(hookMeter.metrics).map(([key, metric]) => {
                  const labels = {
                    openingHook: 'Opening Hook',
                    characterPresence: 'Character Presence',
                    narrativeArc: 'Narrative Arc',
                    sensoryDetails: 'Sensory Details',
                    emotionalResonance: 'Emotional Resonance',
                  };
                  if (!metric?.weakness) return null;
                  return (
                    <li key={key} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="mt-1 text-slate-400">•</span>
                      <div>
                        <span className="font-medium text-slate-700">{labels[key] || key}:</span>{' '}
                        <span>{metric.weakness}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          
          {/* Suggestions */}
          {/* Suggestions */}
          {hookMeter.suggestions && hookMeter.suggestions.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Suggestions</h4>
              <ul className="space-y-1">
                {hookMeter.suggestions.map((suggestion, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                    <svg className="h-4 w-4 flex-shrink-0 text-slate-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Fallback when no weaknesses and no suggestions */}
          {(!hookMeter.metrics || !Object.values(hookMeter.metrics).some(m => m?.weakness)) && 
           (!hookMeter.suggestions || hookMeter.suggestions.length === 0) && (
            <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-700">
              <p>Storytelling analysis completed. Check the metrics above for detail.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function App() {
  const [text, setText] = useState(sampleArticle);
  const [url, setUrl] = useState("");
  const [activeTab, setActiveTab] = useState("paste");
  const [mode, setMode] = useState("hybrid");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [expandedCategory, setExpandedCategory] = useState(null);
  
  // Revision states
  const [reviseCategories, setReviseCategories] = useState(['passive', 'puebi']);
  const [revising, setRevising] = useState(false);
  const [revisionResult, setRevisionResult] = useState(null);
  const [revisionError, setRevisionError] = useState("");
  
  // Highlights collapse state
  const [highlightsExpanded, setHighlightsExpanded] = useState(false);
  
  // Hook Meter state
  const [hookMeter, setHookMeter] = useState(null);
  const [hookMeterLoading, setHookMeterLoading] = useState(false);

  const words = useMemo(
    () => text.trim().split(/\s+/).filter(Boolean).length,
    [text],
  );

  const toggleCategory = (name) =>
    setExpandedCategory((prev) => (prev === name ? null : name));
    
  // Handle category checkbox toggle
  const toggleRevisionCategory = (categoryId) => {
    setReviseCategories(prev => 
      prev.includes(categoryId)
        ? prev.filter(c => c !== categoryId)
        : [...prev, categoryId]
    );
  };
  
  // Word-level LCS diff
  const computeDiff = (original, revised) => {
    if (!original || !revised) return [];
    const ow = original.split(/(\s+)/);
    const rw = revised.split(/(\s+)/);
    const m = ow.length, n = rw.length;
    const lcs = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        lcs[i][j] = ow[i - 1] === rw[j - 1] 
          ? lcs[i - 1][j - 1] + 1 
          : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    const stack = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && ow[i - 1] === rw[j - 1]) { 
        stack.push({ text: ow[i - 1], changed: false }); i--; j--; 
      }
      else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) { 
        stack.push({ text: rw[j - 1], changed: true }); j--; 
      }
      else { i--; }
    }
    return stack.reverse();
  };

  // Helper functions for frontend regex fixes
  const fixSpacing = (text) => {
    const original = text;
    const fixed = text.replace(/  +/g, ' ');
    const changes = [];
    if (original !== fixed) {
      const regex = /  +/g;
      let match;
      while ((match = regex.exec(original)) !== null) {
        changes.push({
          type: 'spacing',
          original: match[0],
          revised: ' ',
          reason: `Ditemukan ${match[0].length - 1} spasi berlebih`
        });
      }
    }
    return { text: fixed, changes };
  };

  const fixTrailing = (text) => {
    const original = text;
    const fixed = text.replace(/[ \t]+$/gm, '');
    const changes = [];
    if (original !== fixed) {
      const lines = original.split('\n');
      lines.forEach((line, idx) => {
        const trimmed = line.replace(/[ \t]+$/, '');
        if (line !== trimmed) {
          changes.push({
            type: 'trailing',
            original: line.slice(-(line.length - trimmed.length)),
            revised: '(dihapus)',
            reason: `Spasi trailing di baris ${idx + 1}`
          });
        }
      });
    }
    return { text: fixed, changes };
  };
  
  // Handle revision request
  const handleRevise = async () => {
    if (reviseCategories.length === 0) {
      setRevisionError("Pilih minimal satu kategori untuk direvisi.");
      return;
    }
    
    setRevisionError("");
    setRevising(true);
    setRevisionResult(null);
    
    try {
      const sourceText = result?.extracted_body || text;
      let finalText = sourceText;
      let allChanges = [];
      
      // Handle spacing/trailing in frontend (regex-based, no API needed)
      const frontendOnlyCategories = ['spacing', 'trailing'];
      const llmCategories = ['passive', 'complex', 'formal', 'puebi', 'struktur', 'seo', 'hookMeter'];
      const onlyFrontend = reviseCategories.every(c => frontendOnlyCategories.includes(c));
      
      if (onlyFrontend) {
        // Only spacing/trailing - no API call needed
        if (reviseCategories.includes('spacing')) {
          const spacingResult = fixSpacing(finalText);
          finalText = spacingResult.text;
          allChanges = allChanges.concat(spacingResult.changes);
        }
        if (reviseCategories.includes('trailing')) {
          const trailingResult = fixTrailing(finalText);
          finalText = trailingResult.text;
          allChanges = allChanges.concat(trailingResult.changes);
        }
        
        setRevisionResult({
          revised_text: finalText,
          changes: allChanges,
          wordCount: {
            before: sourceText.split(/\s+/).filter(Boolean).length,
            after: finalText.split(/\s+/).filter(Boolean).length
          }
        });
      } else {
        // Call API for LLM categories (includes struktur & seo)
        const apiCategories = reviseCategories.filter(c => llmCategories.includes(c));
        
        const response = await fetch("/api/revise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: sourceText,
            categories: apiCategories
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Gagal melakukan revisi");
        }
        
        const data = await response.json();
        finalText = data.revised_text;
        allChanges = [...(data.changes || [])];
        
        // Apply frontend fixes after LLM revision
        if (reviseCategories.includes('spacing')) {
          const spacingResult = fixSpacing(finalText);
          finalText = spacingResult.text;
          allChanges = allChanges.concat(spacingResult.changes);
        }
        if (reviseCategories.includes('trailing')) {
          const trailingResult = fixTrailing(finalText);
          finalText = trailingResult.text;
          allChanges = allChanges.concat(trailingResult.changes);
        }
        
        setRevisionResult({
          ...data,
          revised_text: finalText,
          changes: allChanges
        });
      }
    } catch (err) {
      setRevisionError(err.message || "Terjadi kesalahan saat revisi");
    } finally {
      setRevising(false);
    }
  };

  const analyze = async () => {
    setError("");
    setLoading(true);
    setResult(null);
    setExpandedCategory(null);
    setRevisionResult(null);
    setHookMeter(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: activeTab === "url" ? "" : text,
          url: activeTab === "url" ? url : "",
          mode: mode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Gagal melakukan analisis");
      }

      const data = await response.json();
      setResult(data);
      
      // Analyze Hook Meter separately
      setHookMeterLoading(true);
      try {
        const hookMeterResponse = await fetch("/api/hook-meter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: data.extracted_body || text
          }),
        });
        
        if (hookMeterResponse.ok) {
          const hookMeterData = await hookMeterResponse.json();
          setHookMeter(hookMeterData);
        }
      } catch (hookErr) {
        console.log("Hook Meter analysis skipped:", hookErr.message);
      } finally {
        setHookMeterLoading(false);
      }
    } catch (err) {
      setError(err.message || "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  const modeOptions = [
    { id: 'local', name: 'Lokal ', desc: 'tanpa API' },
    { id: 'hybrid', name: 'Hybrid (Disarankan)' },
    { id: 'llm', name: 'LLM Penuh' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-blue-50 to-indigo-50 text-blue-950">
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
        <Masthead />

        <div className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-blue-200/80 sm:mb-8 sm:p-8">
          <div className="mb-6 max-w-3xl">
            <p className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
              AI Artikel Analyzer
            </p>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-blue-950 sm:text-4xl">
              Analisis kualitas artikel secara cepat
            </h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Tempel teks artikel atau masukkan tautan. Tidak ada login, tidak
              ada dashboard yang rumit &mdash; langsung analisis.
            </p>
          </div>

          {/* Mode Selector */}
          <div className="mb-6 rounded-2xl bg-slate-50 p-4">
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Mode Analisis
            </label>
            <div className="flex flex-wrap gap-2">
              {modeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMode(opt.id)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    mode === opt.id
                      ? "bg-blue-900 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-blue-50"
                  }`}
                >
                  {opt.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {modeOptions.find((m) => m.id === mode)?.desc}
              {mode !== "local" && (
                <span className="ml-2 text-amber-600">
                  Membutuhkan API key Olagon
                </span>
              )}
            </p>
          </div>

          <div className="mb-6 flex w-fit gap-2 rounded-2xl bg-blue-50 p-1 text-sm font-semibold text-blue-700">
            <button
              type="button"
              className={`rounded-2xl px-4 py-2 transition ${activeTab === "paste" ? "bg-blue-900 text-white" : "hover:bg-blue-100"}`}
              onClick={() => setActiveTab("paste")}
            >
              Analisis
            </button>
            <button
              type="button"
              className={`rounded-2xl px-4 py-2 transition ${activeTab === "url" ? "bg-blue-900 text-white" : "hover:bg-blue-100"}`}
              onClick={() => setActiveTab("url")}
            >
              URL
            </button>
          </div>

          {activeTab === "paste" && (
            <>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div className="rounded-3xl bg-blue-50 p-4 ring-1 ring-blue-200">
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    rows={12}
                    className="w-full rounded-3xl border border-blue-200 bg-white px-5 py-4 text-sm leading-6 text-blue-950 outline-none ring-blue-300 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    placeholder="Tempel artikel Anda di sini..."
                  />
                </div>

                <div className="flex flex-col gap-3 rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-blue-200">
                  <div className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-500">
                    Ringkasan
                  </div>
                  <div className="text-4xl font-semibold text-blue-950">
                    {words}
                  </div>
                  <div className="text-sm text-slate-500">Jumlah kata</div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-600">
                  Data tetap lokal dan sederhana. Fokus pada analisis artikel.
                </div>
                <button
                  type="button"
                  onClick={analyze}
                  disabled={loading || !text.trim()}
                  className="inline-flex items-center justify-center rounded-3xl bg-blue-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {loading ? "Menganalisis..." : "Mulai Analisis"}
                </button>
              </div>
            </>
          )}

          {activeTab === "url" && (
            <>
              <div className="rounded-3xl bg-blue-50 p-4 ring-1 ring-blue-200">
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  type="url"
                  className="w-full rounded-3xl border border-blue-200 bg-white px-5 py-4 text-sm outline-none ring-blue-300 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="Masukkan tautan artikel, misal manadopost.id/..."
                />
                <p className="mt-3 text-sm text-slate-500">
                  Tempel URL artikel dari website mana pun untuk dianalisis.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-600">
                  AI akan mengekstrak konten dari URL dan menganalisisnya.
                </div>
                <button
                  type="button"
                  onClick={analyze}
                  disabled={loading || !url.trim()}
                  className="inline-flex items-center justify-center rounded-3xl bg-blue-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {loading ? "Menganalisis..." : "Analisis dari URL"}
                </button>
              </div>
            </>
          )}

          {error && (
            <div className="mt-4 rounded-3xl bg-rose-50 px-5 py-4 text-sm text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          )}
        </div>

        {result && (
          <section className="space-y-6">
            {/* Result Header - always full width, always first */}
            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-blue-200 sm:p-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-500">
                      Hasil Analisis
                    </p>
                    {result.skippedLLM && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                        Mode Lokal
                      </span>
                    )}
                    {result.fromCache && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        Cache
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold text-blue-950 sm:text-3xl">
                    Skor artikel: {result.overallScore}
                  </h2>
                  {result.sourceDomain && (
                    <p className="mt-1 text-sm text-slate-500">
                      Sumber: {result.sourceDomain}
                    </p>
                  )}
                  <p className="mt-2 max-w-2xl text-slate-600">
                    {result.summary}
                  </p>
                </div>
                <span
                  className={`inline-flex w-fit rounded-full px-4 py-2 text-sm font-semibold ${badgeColor(result.overallScore)}`}
                >
                  {verdictFromScore(result.overallScore)}
                </span>
              </div>
            </div>

            {/* Two-column area: sidebar (score) shows right after header on mobile, sits on the right on desktop */}
            <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
            {/* Main column */}
            <div className="order-2 space-y-6 lg:order-1">
            {/* Verification Flags Section */}
            {result.verificationFlags &&
              result.verificationFlags.length > 0 && (
                <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5 sm:p-8">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <WarningGlyph className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                      <div>
                        <h3 className="text-lg font-semibold text-amber-900">
                          Perlu Verifikasi Manual
                        </h3>
                        <p className="mt-0.5 text-sm text-amber-700">
                          {result.verificationFlags.length} item memerlukan
                          perhatian sebelum dipublikasikan
                        </p>
                      </div>
                    </div>
                    <span className="flex-shrink-0 rounded-full bg-amber-200 px-3 py-1 text-sm font-semibold text-amber-800">
                      {result.verificationFlags.length}
                    </span>
                  </div>
                  <VerificationFlagList flags={result.verificationFlags} extractedBody={result.extracted_body} />
                  <div className="mt-4 border-t border-amber-200 pt-4">
                    <button className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 hover:text-amber-950">
                      <CheckGlyph className="h-4 w-4" />
                      Tandai semua terverifikasi
                    </button>
                  </div>
                </div>
              )}

            {/* Highlights Section */}
            {result.highlights && result.highlights.length > 0 && (
              <div className="rounded-3xl bg-white shadow-sm ring-1 ring-blue-200">
                <button
                  type="button"
                  onClick={() => setHighlightsExpanded(!highlightsExpanded)}
                  className="flex w-full items-center justify-between p-6 text-left"
                >
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-blue-950">
                      Sorotan Kalimat
                    </h3>
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      {result.highlights.length}
                    </span>
                    {/* Info tooltip */}
                    <span className="group relative">
                      <svg className="h-4 w-4 text-slate-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden w-64 rounded-lg bg-slate-800 p-3 text-xs text-white shadow-lg group-hover:block z-10">
                        <p className="font-medium mb-1">Tentang Sorotan Kalimat</p>
                        <p className="text-slate-300">Sorotan Kalimat menampilkan kalimat-kalimat yang perlu perhatian khusus berdasarkan hasil analisis, seperti kalimat yang terlalu panjang, ambigu, atau berpotensi menimbulkan masalah etika.</p>
                        <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                      </div>
                    </span>
                  </div>
                  <ChevronIcon 
                    className={`h-5 w-5 text-slate-400 transition-transform ${highlightsExpanded ? 'rotate-180' : ''}`} 
                  />
                </button>
                
                {highlightsExpanded && (
                  <div className="border-t border-slate-100 px-6 pb-6 pt-2">
                    <div className="grid gap-4 text-sm leading-7 text-slate-700 md:grid-cols-2">
                      {result.highlights.map((item, idx) => (
                        <div
                          key={idx}
                          className={`rounded-3xl border p-4 ${
                            item.type === "bad"
                              ? "border-rose-200 bg-rose-50"
                              : item.type === "warn"
                                ? "border-amber-200 bg-amber-50"
                                : "border-emerald-200 bg-emerald-50"
                          }`}
                        >
                          <p className="font-semibold text-blue-950">
                            {item.type === "bad"
                              ? "Perlu perbaikan serius"
                              : item.type === "warn"
                                ? "Perlu perhatian"
                                : "Baik"}
                          </p>
                          <p className="mt-2 text-slate-700">{item.text}</p>
                          {item.note && (
                            <p className="mt-2 text-sm text-slate-500">
                              {item.note}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Hook Meter Section */}
            {(hookMeter || hookMeterLoading) && (
              <HookMeterCard hookMeter={hookMeter} loading={hookMeterLoading} />
            )}

            {/* Auto-Revisi Section */}
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-blue-200">
              <h3 className="text-lg font-semibold text-blue-950 mb-1">
                Auto-Revisi
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                Pilih kategori yang ingin diperbaiki, lalu klik Revisi Sekarang.
              </p>
              
              {/* Category checkboxes */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { id: 'passive', label: 'Kalimat Pasif', desc: 'Ubah ke kalimat aktif' },
                  { id: 'complex', label: 'Kalimat Panjang', desc: 'Sederhanakan' },
                  { id: 'formal', label: 'Kata Formal', desc: 'Variasikan kata' },
                  { id: 'puebi', label: 'Ejaan & PUEBI', desc: 'Perbaiki ejaan' },
                  { id: 'spacing', label: 'Spasi Ganda', desc: '2 spasi jadi 1' },
                  { id: 'trailing', label: 'Spasi Akhir', desc: 'Hapus trailing' },
                  { id: 'struktur', label: 'Struktur & Format', desc: 'Fix judul, lead, heading', badge: 'LLM' },
                  { id: 'seo', label: 'SEO', desc: 'Fix keyword, paragraf mati', badge: 'LLM' },
                  { id: 'hookMeter', label: 'Storytelling', desc: 'Tingkatkan Hook Meter', badge: 'LLM' },
                ].map(cat => (
                  <label
                    key={cat.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                      reviseCategories.includes(cat.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={reviseCategories.includes(cat.id)}
                      onChange={() => toggleRevisionCategory(cat.id)}
                      className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-700">{cat.label}</p>
                        {cat.badge && (
                          <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                            {cat.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{cat.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              
              {revisionError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {revisionError}
                </div>
              )}
              
              <button
                type="button"
                onClick={handleRevise}
                disabled={revising || reviseCategories.length === 0}
                className="rounded-xl bg-blue-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {revising ? 'Merevisi...' : 'Revisi Sekarang'}
              </button>
              
              {/* Revision Results */}
              {revisionResult && (
                <div className="mt-6 border-t border-slate-200 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-base font-semibold text-blue-950">
                      Hasil Revisi
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(revisionResult.revised_text);
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                    >
                      Salin
                    </button>
                  </div>
                  
                  <p className="text-xs text-slate-500 mb-3">
                    {revisionResult.changes?.length || 0} perubahan. 
                    {revisionResult.wordCount?.before && revisionResult.wordCount?.after && (
                      <span>{revisionResult.wordCount.before} kata {'->'} {revisionResult.wordCount.after} kata</span>
                    )}
                  </p>
                  
                  {/* Diff view */}
                  <div className="mb-4 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed">
                    <div className="whitespace-pre-wrap">
                      {computeDiff(result.extracted_body || text, revisionResult.revised_text).map((seg, i) =>
                        seg.changed
                          ? <span key={i} className="rounded bg-green-100 px-0.5 text-green-800">{seg.text}</span>
                          : <span key={i}>{seg.text}</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Changes detail */}
                  {revisionResult.changes && revisionResult.changes.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-slate-700">Detail Perubahan:</p>
                      {revisionResult.changes.map((change, idx) => (
                        <div key={idx} className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                              change.type === 'passive' ? 'bg-red-100 text-red-700' :
                              change.type === 'complex' ? 'bg-amber-100 text-amber-700' :
                              change.type === 'formal' ? 'bg-blue-100 text-blue-700' :
                              change.type === 'puebi' ? 'bg-cyan-100 text-cyan-700' :
                              change.type === 'spacing' ? 'bg-slate-100 text-slate-700' :
                              change.type === 'trailing' ? 'bg-gray-100 text-gray-700' :
                              change.type === 'struktur' ? 'bg-purple-100 text-purple-700' :
                               change.type === 'seo' ? 'bg-indigo-100 text-indigo-700' :
                               change.type === 'hookMeter' ? 'bg-pink-100 text-pink-700' :
                               'bg-green-100 text-green-700'
                            }`}>
                              {change.type?.toUpperCase()}
                            </span>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="mb-1 text-xs text-slate-500">Sebelum:</p>
                              <p className="rounded bg-red-50 p-2 text-sm text-slate-600">{change.original}</p>
                            </div>
                            <div>
                              <p className="mb-1 text-xs text-slate-500">Sesudah:</p>
                              <p className="rounded bg-green-50 p-2 text-sm text-slate-600">{change.revised}</p>
                            </div>
                          </div>
                          {change.reason && (
                            <p className="mt-2 text-xs text-blue-600">{change.reason}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>

            {/* Sidebar: Skor per Kategori - shows right after header on mobile, right side on desktop */}
            <aside className="order-1 lg:sticky lg:top-6 lg:order-2">
              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-blue-200 sm:p-6">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-500">
                    Skor per Kategori
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Klik kategori untuk detail lengkap
                  </p>
                </div>
                <CategoryOverviewStrip
                  details={result.details}
                  activeCategory={expandedCategory}
                  onSelect={toggleCategory}
                  layout="sidebar"
                />
              </div>
            </aside>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
