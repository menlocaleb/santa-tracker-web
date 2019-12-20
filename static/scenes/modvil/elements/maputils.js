import {_static} from '../../../src/magic.js';
import * as spherical from '../../../src/api/spherical.js';


const polylineColor = '#22a528';
const polylineWeight = 2;
const trailLength = 20;

const PRESENTS_TRANSIT = 0.3;
const PRESENTS_IN_CITY = 0.7;


export const northpoleLocation = {lat: 84.6, lng: 168};


export function elementMapsOverlay(layer = 'floatPane') {
  return new class extends google.maps.OverlayView {
    constructor() {
      super();
      this._position = null;
      this._container = document.createElement('div');
      this._container.style.willChange = 'transform';

      this._container.addEventListener('click', (ev) => ev.stopPropagation());
    }

    onAdd() {
      const n = this.getPanes()[layer];
      n.append(this._container);
    }

    onRemove() {
      const n = this.getPanes()[layer];
      n.removeChild(this._container);  // noop if not here
    }

    set position(latLng) {
      this._position = latLng;
      this.draw();
    }

    get position() {
      return this._position;
    }

    get container() {
      return this._container;
    }

    draw() {
      const projection = this.getProjection();
      if (!projection || !this._position) {
        this._container.hidden = true;
        return;
      }

      this._container.hidden = false;

      const pos = projection.fromLatLngToDivPixel(this._position);
      this._container.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    }
  };
}


const lerp = (from, to, ratio) => {
  const delta = to - from;
  return from + delta * ratio;
};

const inverseLerp = (from, to, value) => {
  const range = to - from;
  return (value - from) / range;
};


export class DataManager {
  constructor(destinations) {
    this._time = 0;
    this._nextOrCurrentIndex = 0;
    this._destinations = destinations;

    if (this._destinations.length === 0) {
      const year = new Date().getFullYear();
      const countdownTo = +Date.UTC(year, 11, 24, 10, 0, 0);  // 24th Dec at 10:00 UTC
      this._destinations = [
        {
          id: 'takeoff',
          location: northpoleLocation,
          presentsDelivered: 0,
          arrival: 0,
          departure: +countdownTo,
          city: 'Santa\'s Village',
        },
      ];
    }
  }

  get range() {
    if (this._destinations.length === 1) {
      const only = this._destinations[0];
      return {
        from: only.departure,
        to: only.departure,
      };
    }
    return {
      from: this._destinations[0].departure,
      to: this._destinations[this._destinations.length - 1].arrival,
    };
  }

  stop(i) {
    if (i < 0) {
      i = this._destinations.length - i;
    }
    return this._destinations[i] || null;
  }

  get length() {
    return this._destinations.length;
  }

  get details() {
    if (this._nextOrCurrentIndex === 0) {
      return {
        visibleTo: 0,
        location: northpoleLocation,
        presents: 0,
        heading: 0,
        stop: true,
        home: true,
        next: Math.max(0, this._destinations[0].departure - this._time),
      };
    }

    const curr = this._destinations[this._nextOrCurrentIndex];
    const prev = this._destinations[this._nextOrCurrentIndex - 1];

    // Is Santa currently at a stop?
    if (this._time >= curr.arrival) {
      // This is after the transit delivery.
      const ratio = PRESENTS_TRANSIT +
          inverseLerp(curr.arrival, curr.departure, this._time) * PRESENTS_IN_CITY;
      return {
        visibleTo: this._nextOrCurrentIndex,
        location: curr.location,
        presents: Math.round(lerp(prev.presentsDelivered, curr.presentsDelivered, ratio)),
        heading: spherical.computeHeading(prev.location, curr.location),
        stop: true,
        home: (this._nextOrCurrentIndex + 1 >= this._destinations.length),
        next: (curr.departure - this._time),
      };
    }

    // Otherwise, interpolate during flight.
    const flightRatio = inverseLerp(prev.departure, curr.arrival, this._time);
    const presentsRatio = flightRatio * PRESENTS_TRANSIT;
    return {
      visibleTo: this._nextOrCurrentIndex - 1,  // don't show upcoming marker
      location: spherical.interpolate(prev.location, curr.location, flightRatio),
      presents: Math.round(lerp(prev.presentsDelivered, curr.presentsDelivered, presentsRatio)),
      heading: spherical.computeHeading(prev.location, curr.location),
      stop: false,
      home: false,
      next: (curr.arrival - this._time),
    };
  }

  set now(time) {
    time = +time || 0;

    if (time === this._time) {
      return;  // ignore for same or no data (assume at least one stop)
    }
    if (time < this._time) {
      // We went back in time. Reset the state of everything.
      this._nextOrCurrentIndex = 0;
    }
    this._time = time;

    let i = this._nextOrCurrentIndex;
    while (i < this._destinations.length) {
      if (time <= this._destinations[i].departure) {
        this._nextOrCurrentIndex = i;
        break;
      }
      ++i;
    }
    if (i === this._destinations.length) {
      this._nextOrCurrentIndex = this._destinations.length - 1;
    }
  }

  get now() {
    return this._time;
  }
}


export class StopManager {
  constructor(map, manager) {
    this._map = map;
    this._visibleTo = 0;

    const markerIcon = /** @type {google.maps.Icon} */ ({
      url: _static`img/tracker/marker.png`,
      size: new google.maps.Size(15, 18),
      scaledSize: new google.maps.Size(15, 18),
    });

    const homeIcon = /** @type {google.maps.Icon} */ ({
      url: _static`img/tracker/northpole.png`,
      size: new google.maps.Size(132, 100),
      scaledSize: new google.maps.Size(66, 50),
      anchor: new google.maps.Point(33, 25),
    });

    this._markers = [];
    for (let i = 0; i < manager.length; ++i) {
      const {id, location, city} = manager.stop(i);
      const isHome = (id === 'takeoff');  // last stop is a real icon, which looks cute
      const marker = new google.maps.Marker({
        position: location,
        map,
        icon: isHome ? homeIcon : markerIcon,
        visible: false,  // implicit time is zero
        title: city,
      });
      this._markers.push(marker);
    }

    this._activeTrail = new google.maps.Polyline({
      geodesic: true,
      strokeColor: polylineColor,
      strokeWeight: polylineWeight,
      map,
    });

    this._trail = [];
    for (let i = 0; i < trailLength; ++i) {
      const polyline = new google.maps.Polyline({
        geodesic: true,
        strokeColor: polylineColor,
        strokeWeight: polylineWeight,
        strokeOpacity: 1 - (i / trailLength),
        map,
      });
      this._trail.push(polyline);
    }

    this._manager = manager;
  }

  update() {
    const details = this._manager.details;
    const delta = (details.visibleTo - this._visibleTo);
    const reverseTime = (delta < 0);

    // Configure marker visibility.
    if (reverseTime) {
      // we went back in time, clear markers
      for (let i = details.visibleTo + 1; i <= this._visibleTo; ++i) {
        this._markers[i].setVisible(false);
      }
    } else {
      for (let i = this._visibleTo; i <= details.visibleTo; ++i) {
        this._markers[i].setVisible(true);
      }
    }

    // Set trail components if something changed.
    if (delta) {
      const usable = Math.min(details.visibleTo, trailLength);
      let i = 0;
      if (!details.home) {
        // Don't draw any lines at home (start or end).
        for (i = 0; i < usable; ++i) {
          const polyline = this._trail[i];
          polyline.setPath([
            this._manager.stop(details.visibleTo - i).location,
            this._manager.stop(details.visibleTo - i - 1).location,
          ]);
        }
      }
      while (i < trailLength) {
        this._trail[i].setPath([]);
        ++i;
      }
    }

    // Set last trail.
    if (details.stop) {
      this._activeTrail.setPath([]);
    } else {
      const last = this._manager.stop(details.visibleTo);
      this._activeTrail.setPath([
        last.location,
        details.location,
      ]);
    }

    this._visibleTo = details.visibleTo;
  }

  destroy() {
    this._markers.forEach((marker) => marker.setMap(null));
  }
}
