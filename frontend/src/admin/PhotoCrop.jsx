import { useState } from 'react';
import Cropper from 'react-easy-crop';
import { Icon } from '../dashboard/ui.jsx';
import { FREE, RATIOS, ratioValue } from './photos.js';

const STILL = { x: 0, y: 0 };

// The crop tool for one photo: drag to position, slider to zoom, a button to
// turn it. `onChange` gets the photo's changed fields; `edited` is true when
// the person changed it (the tool also reports the crop on first showing it).
// Without `onRatio` the shape is fixed, and only the turn button shows.
// `ratios` are the shapes offered. Free shows the whole photo in its own
// shape, so there is nothing to drag or zoom.
export default function PhotoCrop({ photo, ratio, ratios = RATIOS, onRatio, onChange }) {
  const [size, setSize] = useState(null);
  const free = ratio === FREE;
  const sideways = photo.rotation % 180 !== 0;
  const ownShape = size ? (sideways ? size.naturalHeight / size.naturalWidth : size.naturalWidth / size.naturalHeight) : 1;
  return (
    <div className="adm-crop">
      <div className="adm-crop__stage">
        <Cropper
          key={`${photo.id}-${ratio}-${photo.rotation}`}
          image={photo.src}
          crop={free ? STILL : photo.crop}
          zoom={free ? 1 : photo.zoom}
          rotation={photo.rotation}
          aspect={free ? ownShape : ratioValue(ratio)}
          showGrid={!free}
          onMediaLoaded={setSize}
          onCropChange={(crop) => !free && onChange({ crop })}
          onZoomChange={(zoom) => !free && onChange({ zoom })}
          onCropComplete={(_, area) => onChange({ area })}
          onInteractionStart={() => !free && onChange({ uploaded: null })}
        />
      </div>
      <div className="adm-crop__tools">
        <div className="adm-chips" role="group" aria-label="Photo shape">
          {onRatio && ratios.map((r) => (
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
        {free ? (
          <p className="adm-hint">The whole picture is used, in its own shape. Nothing is cut off.</p>
        ) : (
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
        )}
      </div>
    </div>
  );
}
