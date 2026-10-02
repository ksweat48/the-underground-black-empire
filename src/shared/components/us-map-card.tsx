import { useState, useRef, useEffect } from 'react';
import { MapPin, Users, Building2, X } from 'lucide-react';
import { US_STATES, US_MAP_VIEWBOX, US_MAP_FRAMES, type USStateData } from '@/config/us-states-data';
import type { StateMapData } from '@/domains/founder-campaign/services';
import { cn } from '@/shared/cn';

interface USMapCardProps {
  mapData: Map<string, StateMapData> | null;
  loading: boolean;
  collapsed?: boolean;
  className?: string;
}

function getStateFill(state: string, mapData: Map<string, StateMapData> | null): string {
  if (!mapData) return '#E7E5E0';
  const data = mapData.get(state);
  if (!data || data.totalPopulation === 0) return '#E7E5E0';

  const population = data.totalPopulation;
  if (population >= 1000) return '#4A1F4A';
  if (population >= 100) return '#3D8A6B';
  return '#8FC4AC';
}

export function USMapCard({ mapData, loading, collapsed = false, className }: USMapCardProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const hoveredData = hoveredState ? mapData?.get(hoveredState) : null;

  const handleMouseMove = (e: React.MouseEvent<SVGPathElement>, abbr: string) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
    setHoveredState(abbr);
  };

  const handleClick = (abbr: string) => {
    setSelectedState(abbr);
  };

  const selectedData = selectedState ? mapData?.get(selectedState) : null;
  const selectedStateInfo = US_STATES.find((s) => s.abbreviation === selectedState);

  return (
    <>
      <div
        className={cn(
          'frame-command w-full h-full flex flex-col overflow-hidden transition-all duration-300 ease-out',
          collapsed && 'max-h-0 opacity-0 pointer-events-none mt-0!',
          className,
        )}
      >
        {/* Map */}
        <div className="relative z-10 px-2 pt-2 pb-2 flex-1 flex flex-col min-h-0">
          <div className="relative rounded-lg overflow-hidden bg-white border border-empire-black-900/10 shadow-[0_8px_24px_rgba(26,24,21,0.08)] flex-1 flex items-start justify-center min-h-0 p-1">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/60">
                <div className="w-8 h-8 rounded-full border-2 border-empire-gold/20 border-t-empire-gold animate-spin" />
              </div>
            )}
            <svg
              ref={svgRef}
              xmlns="http://www.w3.org/2000/svg"
              viewBox={`0 0 ${US_MAP_VIEWBOX.width} ${US_MAP_VIEWBOX.height}`}
              preserveAspectRatio="xMidYMin meet"
              className="w-full h-full block"
              style={{ minHeight: '160px' }}
            >
              <g className="outlines">
                {/* Frame lines for AK/HI insets */}
                <path
                  d={US_MAP_FRAMES}
                  fill="none"
                  stroke="rgba(26,24,21,0.06)"
                  strokeWidth="1.5"
                />
                {US_STATES.map((state: USStateData) => {
                  const fill = getStateFill(state.abbreviation, mapData);
                  const isActive = mapData?.has(state.abbreviation) ?? false;
                  const isHovered = hoveredState === state.abbreviation;
                  return (
                    <path
                      key={state.abbreviation}
                      d={state.path}
                      name={state.abbreviation}
                      fill={fill}
                      stroke="#FFFFFF"
                      strokeWidth={isHovered ? 2 : 1.5}
                      strokeLinejoin="round"
                      style={{
                        cursor: isActive ? 'pointer' : 'default',
                        transition: 'fill 200ms ease, stroke-width 150ms ease',
                        filter: isHovered && isActive ? 'brightness(1.08)' : 'none',
                      }}
                      onMouseMove={(e) => handleMouseMove(e, state.abbreviation)}
                      onMouseLeave={() => setHoveredState(null)}
                      onClick={() => isActive && handleClick(state.abbreviation)}
                    />
                  );
                })}
              </g>

              {/* DC circle */}
              <circle
                cx={801.3}
                cy={251.8}
                r={5}
                fill={getStateFill('DC', mapData)}
                stroke="#FFFFFF"
                strokeWidth="1.5"
                style={{ cursor: mapData?.has('DC') ? 'pointer' : 'default' }}
                onMouseMove={(e) => handleMouseMove(e, 'DC')}
                onMouseLeave={() => setHoveredState(null)}
                onClick={() => mapData?.has('DC') && handleClick('DC')}
              />
            </svg>

            {/* Tooltip */}
            {hoveredState && hoveredData && (
              <div
                className="absolute z-20 pointer-events-none px-3 py-2 rounded-lg glass-strong text-xs whitespace-nowrap"
                style={{
                  left: `${(tooltipPos.x / (svgRef.current?.clientWidth ?? 1)) * 100}%`,
                  top: `${(tooltipPos.y / (svgRef.current?.clientHeight ?? 1)) * 100}%`,
                  transform: 'translate(12px, -100%)',
                }}
              >
                <p className="font-display font-bold text-empire-white">
                  {US_STATES.find((s) => s.abbreviation === hoveredState)?.name ?? hoveredState}
                </p>
                <p className="text-[10px] text-empire-text-secondary mt-0.5">
                  {hoveredData.cityCount} cities · {hoveredData.totalPopulation} population
                </p>
              </div>
            )}
          </div>

          {/* Legend removed — state colors now communicate population */}
        </div>
      </div>

      {/* State Detail Modal */}
      {selectedState && (
        <StateDetailModal
          stateAbbr={selectedState}
          stateName={selectedStateInfo?.name ?? selectedState}
          stateData={selectedData ?? null}
          onClose={() => setSelectedState(null)}
        />
      )}
    </>
  );
}

// ==================== State Detail Modal ====================

function StateDetailModal({
  stateAbbr,
  stateName,
  stateData,
  onClose,
}: {
  stateAbbr: string;
  stateName: string;
  stateData: StateMapData | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-[#1A1815]/20 backdrop-blur-sm" aria-hidden="true" />

      <div
        className="relative z-10 w-full max-w-md mt-[10vh] mb-8 animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="glass-panel overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-empire-black-900/8">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-empire-gold/8 border border-empire-gold/20">
                <MapPin className="w-4 h-4 text-empire-gold" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-empire-gold uppercase tracking-wider">{stateAbbr}</p>
                <h3 className="text-lg font-display font-bold text-empire-white leading-tight">{stateName}</h3>
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-empire-black-800/40 hover:bg-empire-black-800/60 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-empire-text-muted" />
            </button>
          </div>

          {/* Stats overview */}
          <div className="px-5 pt-4 pb-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="frame-utility p-2.5 text-center">
                <Building2 className="w-4 h-4 text-empire-gold mx-auto mb-1" />
                <p className="text-xl font-display font-bold text-empire-white tabular-nums">
                  {stateData?.cityCount ?? 0}
                </p>
                <p className="text-[9px] text-empire-text-muted mt-0.5">Cities</p>
              </div>
              <div className="frame-utility p-2.5 text-center">
                <Users className="w-4 h-4 text-empire-gold mx-auto mb-1" />
                <p className="text-xl font-display font-bold text-empire-white tabular-nums">
                  {stateData?.totalPopulation.toLocaleString() ?? 0}
                </p>
                <p className="text-[9px] text-empire-text-muted mt-0.5">Population</p>
              </div>
            </div>
          </div>

          {/* City list */}
          <div className="px-5 pb-5">
            <p className="text-[10px] font-semibold text-empire-text-muted uppercase tracking-wider mb-2">
              Cities in {stateName}
            </p>
            {stateData && stateData.cities.length > 0 ? (
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto scrollbar-thin pr-1">
                {stateData.cities.map((city) => {
                  return (
                    <div key={city.id} className="frame-intel p-2.5 flex items-center gap-2.5">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-empire-gold/5 border border-empire-gold/15 shrink-0">
                        <Building2 className="w-3.5 h-3.5 text-empire-gold" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-empire-white truncate">{city.name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-display font-bold text-empire-gold tabular-nums">
                          {city.population_count.toLocaleString()}
                        </p>
                        <p className="text-[9px] text-empire-text-muted">population</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="frame-intel p-6 text-center">
                <p className="text-sm text-empire-text-secondary">No active cities yet.</p>
                <p className="text-[11px] text-empire-text-muted mt-1">
                  Be the first to claim a city in {stateName}.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
