import Cropper from 'react-easy-crop';
import { Icon } from '../dashboard/ui.jsx';
import { RATIOS, ratioValue } from './photos.js';

// The crop tool for one photo: drag to position, slider to zoom, a button to
// turn it. `onChange` gets the photo's changed fields; `edited` is true when
// the person changed it (the tool also reports the crop on first showing it).
// Without `onRatio` the shape is fixed, and only the turn button shows.
export default function PhotoCrop({ photo, ratio, onRatio, onChange }) {
  return (
    <div className="adm-crop">
      <div className="adm-crop__stage">
        <Cropper
          key={`${photo.id}-${ratio}-${photo.rotation}`}
          image={photo.src}
          crop={photo.crop}
          zoom={photo.zoom}
          rotation={photo.rotation}
          aspect={ratioValue(ratio)}
          showGrid
          onCropChange={(crop) => onChange({ crop })}
          onZoomChange={(zoom) => onChange({ zoom })}
          onCropComplete={(_, area) => onChange({ area })}
          onInteractionStart={() => onChange({ uploaded: null })}
        />
      </div>
      <div className="adm-crop__tools">
        <div className="adm-chips" role="group" aria-label="Photo shape">
          {onRatio && RATIOS.map((r) => (
            <button key={r.key} type="button" className={`adm-chip${ratio === r.key ? ' is-on' : ''}`} onClick={() => onRatio(r.key)}>
              {r.label}
            </button>
          ))}
          <button
            type="button"
            className="adm-chip"
            onClick={() => onChange({ rotation: (photo.rotation + 90) % 360, crop: { x: 0, y: 0 }, zoom: 1, area: null, uploaded: null })}
          >
            <Icon name="refresh" size={15} /> Turn
          </button>
        </div>
        <label className="adm-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={photo.zoom}
            onChange={(e) => onChange({ zoom: Number(e.target.value), uploaded: null })}
          />
        </label>
      </div>
    </div>
  );
}
