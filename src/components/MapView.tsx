import React, { useState, useMemo } from 'react';
import { MapPin, Navigation, Star, Phone, Mail, Globe, ExternalLink, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { ScrapedBusiness } from '../types/scraper';
import { HelpButton } from './HelpButton';

interface MapViewProps {
  businesses: ScrapedBusiness[];
  onSelectBusiness: (biz: ScrapedBusiness) => void;
  onOpenGuide: (guideId: string) => void;
}

export const MapView: React.FC<MapViewProps> = ({
  businesses,
  onSelectBusiness,
  onOpenGuide
}) => {
  const [selectedPlace, setSelectedPlace] = useState<ScrapedBusiness | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    businesses.forEach(b => set.add(b.category));
    return Array.from(set);
  }, [businesses]);

  const filteredPlaces = useMemo(() => {
    if (selectedCategory === 'all') return businesses;
    return businesses.filter(b => b.category === selectedCategory);
  }, [businesses, selectedCategory]);

  // Compute bounding box
  const bounds = useMemo(() => {
    if (filteredPlaces.length === 0) {
      return { minLat: 25, maxLat: 48, minLon: -125, maxLon: -70 };
    }
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    filteredPlaces.forEach(p => {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLon) minLon = p.longitude;
      if (p.longitude > maxLon) maxLon = p.longitude;
    });

    // Add padding
    const latSpan = Math.max(maxLat - minLat, 0.05);
    const lonSpan = Math.max(maxLon - minLon, 0.05);

    return {
      minLat: minLat - latSpan * 0.1,
      maxLat: maxLat + latSpan * 0.1,
      minLon: minLon - lonSpan * 0.1,
      maxLon: maxLon + lonSpan * 0.1
    };
  }, [filteredPlaces]);

  // Convert lat/long to percent (x, y) coordinates
  const getCoordinatesPercent = (lat: number, lon: number) => {
    const latRange = bounds.maxLat - bounds.minLat || 1;
    const lonRange = bounds.maxLon - bounds.minLon || 1;

    // Y is inverted (higher lat is top)
    const y = 100 - ((lat - bounds.minLat) / latRange) * 100;
    const x = ((lon - bounds.minLon) / lonRange) * 100;

    return {
      x: Math.max(5, Math.min(95, x)),
      y: Math.max(8, Math.min(92, y))
    };
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col h-[680px] relative">
      {/* Top Map Control Bar */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-slate-400 font-medium whitespace-nowrap text-[11px]">Lọc theo ngành:</span>
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2 py-1 rounded transition-colors whitespace-nowrap text-[11px] ${
              selectedCategory === 'all'
                ? 'bg-blue-600 text-white font-medium'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            Tất cả danh mục ({businesses.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-1 rounded transition-colors whitespace-nowrap text-[11px] ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white font-medium'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
          <HelpButton guideId="map_view" onOpenGuide={onOpenGuide} tooltipText="Xem cách sử dụng bản đồ tương tác & màu sắc ghim" />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            {filteredPlaces.length} địa điểm hiển thị
          </span>
          <button
            onClick={() => setZoomLevel(prev => Math.min(prev + 0.25, 2.0))}
            className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
            title="Phóng to"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel(prev => Math.max(prev - 0.25, 0.75))}
            className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
            title="Thu nhỏ"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel(1)}
            className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
            title="Đặt lại khung nhìn"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Interactive Map Viewport */}
      <div 
        className="flex-1 bg-[#090d16] relative overflow-hidden cursor-crosshair select-none"
        onClick={() => setSelectedPlace(null)}
      >
        {/* Subtle Map Grid Background */}
        <div 
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#3b82f6 1px, transparent 1px), radial-gradient(#1e293b 1px, #090d16 1px)`,
            backgroundSize: '40px 40px',
            backgroundPosition: '0 0, 20px 20px',
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease-out'
          }}
        />

        {/* Map stylized geographic contour lines */}
        <svg 
          className="absolute inset-0 w-full h-full opacity-15 pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M 0,200 Q 300,150 600,250 T 1200,200" fill="none" stroke="#60a5fa" strokeWidth="1" strokeDasharray="4 4" />
          <path d="M 100,500 Q 400,420 800,520 T 1400,480" fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx="35%" cy="45%" r="180" fill="none" stroke="#1d4ed8" strokeWidth="0.8" />
          <circle cx="70%" cy="60%" r="220" fill="none" stroke="#1d4ed8" strokeWidth="0.8" />
        </svg>

        {/* Scaled Pins Canvas */}
        <div 
          className="absolute inset-0"
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease-out'
          }}
        >
          {filteredPlaces.map((biz) => {
            const { x, y } = getCoordinatesPercent(biz.latitude, biz.longitude);
            const isSelected = selectedPlace?.id === biz.id;

            return (
              <div
                key={biz.id}
                style={{ left: `${x}%`, top: `${y}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPlace(biz);
                }}
                className={`absolute -translate-x-1/2 -translate-y-full cursor-pointer group transition-transform z-20 ${
                  isSelected ? 'scale-125 z-30' : 'hover:scale-110'
                }`}
              >
                {/* Pin Head */}
                <div className={`p-1.5 rounded-full shadow-lg border flex items-center justify-center transition-colors ${
                  biz.leadStatus === 'hot'
                    ? 'bg-blue-600 border-white text-white'
                    : biz.leadStatus === 'warm'
                    ? 'bg-amber-500 border-white text-white'
                    : 'bg-slate-700 border-slate-400 text-slate-200'
                }`}>
                  <MapPin className="w-3.5 h-3.5 fill-current" />
                </div>

                {/* Subtle pulse for selected */}
                {isSelected && (
                  <div className="absolute inset-0 rounded-full bg-blue-400/40 animate-ping -z-10" />
                )}

                {/* Hover Label Preview */}
                <div className="hidden group-hover:block absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-0.5 bg-slate-900 border border-slate-700 text-white text-[10px] font-medium rounded whitespace-nowrap pointer-events-none shadow-md z-30">
                  {biz.title} ({biz.rating}★)
                </div>
              </div>
            );
          })}
        </div>

        {/* Floating Detail Popover for selected pin */}
        {selectedPlace && (
          <div 
            className="absolute bottom-5 left-5 right-5 sm:right-auto sm:w-96 bg-slate-900 border border-slate-700 rounded-lg p-4 shadow-2xl z-40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h3 className="text-sm font-bold text-white leading-snug">{selectedPlace.title}</h3>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                  <span className="text-blue-400 font-medium">{selectedPlace.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedPlace.city}, {selectedPlace.state}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlace(null)}
                className="text-slate-400 hover:text-white p-0.5"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs mb-3 font-mono">
              <div className="flex items-center gap-1 text-amber-400 font-semibold tabular-nums">
                <Star className="w-3.5 h-3.5 fill-current" />
                <span>{selectedPlace.rating.toFixed(1)}</span>
                <span className="text-slate-400 font-normal">({selectedPlace.reviewsCount} đánh giá)</span>
              </div>
              <span className="text-slate-600">|</span>
              <div className="text-slate-300">
                Lead Score: <span className="text-blue-400 font-bold tabular-nums">{selectedPlace.leadScore}/100</span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-slate-300 mb-3 border-y border-slate-800 py-2">
              {selectedPlace.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <a href={`tel:${selectedPlace.phone}`} className="hover:underline font-mono">
                    {selectedPlace.phone}
                  </a>
                </div>
              )}
              {selectedPlace.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <a href={`mailto:${selectedPlace.email}`} className="hover:underline font-mono truncate">
                    {selectedPlace.email}
                  </a>
                </div>
              )}
              {selectedPlace.website && (
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <a href={selectedPlace.website} target="_blank" rel="noreferrer" className="hover:underline truncate text-blue-400">
                    {selectedPlace.website}
                  </a>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onSelectBusiness(selectedPlace)}
                className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded transition-colors text-center"
              >
                Xem hồ sơ chi tiết
              </button>
              <a
                href={selectedPlace.googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded transition-colors flex items-center justify-center"
                title="Mở chỉ đường trên Google Maps"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-4 right-4 bg-slate-900/90 border border-slate-800 rounded p-2.5 text-[11px] text-slate-300 space-y-1.5 pointer-events-none backdrop-blur-xs">
          <div className="font-semibold text-white text-xs mb-1">Chất lượng Lead</div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
            <span>Hot Lead (Điểm ≥ 85)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            <span>Warm Lead (Điểm 65–84)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block" />
            <span>Listing cơ bản</span>
          </div>
        </div>
      </div>
    </div>
  );
};
