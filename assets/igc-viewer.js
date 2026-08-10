/* global console, document, fetch, window */

(() => {
  'use strict';

  const VERSION = '2.2.0';
  const DEFAULT_CAMERA = Object.freeze({
    distanceMeters: 5000,
    elevationAngleDegrees: 20,
    lookAheadSeconds: 0.35,
    lagSeconds: 0,
    followSmoothingSeconds: 1.5,
    headingSmoothingSeconds: 8,
    headingOffsetDegrees: 180,
    fixedHeadingEnabled: true,
    fixedHeadingDegrees: 0,
    fieldOfViewDegrees: 25,
    minimumTerrainClearanceMeters: 30,
  });
  if (window.__volareIgcViewerBootstrapped) return;
  window.__volareIgcViewerBootstrapped = true;

  const Cesium = window.Cesium;
  const instances = new Map();
  const SELECTOR = '[data-igc-viewer]';

  class IgcViewer {
    constructor(options) {
      this.options = options;
      this.container = document.getElementById(options.targetElementId);
      if (!this.container) {
        throw new Error(`IGC viewer target "${options.targetElementId}" was not found.`);
      }

      this.viewer = null;
      this.samples = [];
      this.trailPositions = [];
      this.tickListener = null;
      this.isAutoCameraEnabled = true;
      this.elements = this.findElements();
    }

    findElements() {
      const find = (name) => this.container.querySelector(`[data-viewer-${name}]`);
      return {
        map: find('map'),
        credits: find('credits'),
        loading: find('loading'),
        status: find('status'),
        controls: find('controls'),
        play: find('play'),
        scrubber: find('scrubber'),
        progress: find('progress'),
        current: find('current'),
        duration: find('duration'),
        altitudePath: find('altitude-path'),
        altitude: find('altitude'),
        speed: find('speed'),
        vario: find('vario'),
        distance: find('distance'),
        fullscreen: find('fullscreen'),
        error: find('error'),
      };
    }

    async initialize() {
      this.validateElements();
      this.bindControls();
      this.setStatus('Loading terrain and imagery');

      try {
        this.createScene();
        const response = await fetch(this.options.igcFileUrl);
        if (!response.ok) {
          throw new Error(`Track request failed with ${response.status} ${response.statusText}.`);
        }
        this.samples = parseIgc(await response.text());
        this.calculateMetrics();
        this.renderFlight();
        this.elements.loading.hidden = true;
        this.elements.controls.hidden = false;
      } catch (error) {
        this.showError(error instanceof Error ? error.message : 'The flight could not be loaded.');
        throw error;
      }
    }

    validateElements() {
      const required = ['map', 'credits', 'loading', 'controls', 'play', 'scrubber'];
      const missing = required.filter((key) => !this.elements[key]);
      if (missing.length) {
        throw new Error(`IGC viewer is missing required elements: ${missing.join(', ')}.`);
      }
      if (!this.options.igcFileUrl) throw new Error('The IGC viewer requires a track URL.');
    }

    createScene() {
      this.options.cesiumToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2ZTM1OThjYi1mNTU4LTRmNDctOWNhNS0wNWI2MTA1ZGU2NjIiLCJpZCI6Mjk3MzE1LCJpYXQiOjE3NDU2MjYwNTd9.aJytwthdrinNHz2hVJ5J-Ry62xFzy4alE_-uVgWvg9U';
      if (this.options.cesiumToken) Cesium.Ion.defaultAccessToken = this.options.cesiumToken;

      const terrain = Cesium.Terrain.fromWorldTerrain({
        requestVertexNormals: true,
        requestWaterMask: true,
      });
      const baseLayer = Cesium.ImageryLayer.fromWorldImagery({});
      terrain.errorEvent.addEventListener(() =>
        this.showError('Cesium World Terrain could not load. Check the ion token and its scopes.'),
      );
      baseLayer.errorEvent.addEventListener(() =>
        this.showError('Cesium World Imagery could not load. Check the ion token and its scopes.'),
      );
      this.viewer = new Cesium.Viewer(this.elements.map, {
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        baseLayer,
        terrain,
        scene3DOnly: true,
        requestRenderMode: true,
        maximumRenderTimeChange: Number.POSITIVE_INFINITY,
        msaaSamples: 4,
        creditContainer: this.elements.credits,
        contextOptions: {
          webgl: { antialias: true, powerPreference: 'high-performance' },
        },
      });
      this.viewer.scene.globe.depthTestAgainstTerrain = true;
      this.viewer.scene.globe.maximumScreenSpaceError = 1.5;
    }

    calculateMetrics() {
      let cumulativeDistance = 0;
      this.samples[0].distanceMeters = 0;
      this.samples[0].speedMps = 0;

      for (let index = 1; index < this.samples.length; index += 1) {
        const previous = this.samples[index - 1];
        const current = this.samples[index];
        const geodesic = new Cesium.EllipsoidGeodesic(previous.cartographic, current.cartographic);
        const distance = geodesic.surfaceDistance;
        const seconds = Cesium.JulianDate.secondsDifference(current.time, previous.time);
        cumulativeDistance += distance;
        current.distanceMeters = cumulativeDistance;
        current.speedMps = seconds > 0 ? distance / seconds : previous.speedMps;
      }
    }

    renderFlight() {
      const positions = this.samples.map((sample) => sample.position);
      const start = this.samples[0].time;
      const stop = this.samples.at(-1).time;
      const position = new Cesium.SampledPositionProperty();
      for (const sample of this.samples) position.addSample(sample.time, sample.position);
      position.setInterpolationOptions({
        interpolationDegree: 1,
        interpolationAlgorithm: Cesium.LinearApproximation,
      });

      if (this.options.showGhostRoute) {
        this.viewer.entities.add({
          polyline: {
            positions,
            width: 3,
            material: Cesium.Color.fromCssColorString('#e7f4ef').withAlpha(0.22),
          },
        });
      }
      this.viewer.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => this.trailPositions, false),
          width: 5,
          material: new Cesium.PolylineOutlineMaterialProperty({
            color: Cesium.Color.fromCssColorString('#efad38'),
            outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
            outlineWidth: 2,
          }),
        },
      });
      this.viewer.entities.add({
        availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start, stop })]),
        position,
        point: {
          color: Cesium.Color.fromCssColorString('#fff4d6'),
          pixelSize: 11,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
          outlineWidth: 3,
          scaleByDistance: new Cesium.NearFarScalar(100, 1.4, 20000, 0.7),
        },
      });

      const clock = this.viewer.clock;
      clock.startTime = start.clone();
      clock.stopTime = stop.clone();
      clock.currentTime = start.clone();
      clock.clockRange = Cesium.ClockRange.LOOP_STOP;
      clock.multiplier = this.options.playbackRate;
      clock.shouldAnimate = false;

      this.prepareTimeline();
      this.frameTrack(positions);
      this.tickListener = (currentClock) => this.updateAtTime(currentClock.currentTime);
      clock.onTick.addEventListener(this.tickListener);
      this.updateAtTime(start);
    }

    prepareTimeline() {
      const duration = this.durationSeconds;
      this.elements.scrubber.max = String(duration);
      this.elements.duration.textContent = formatDuration(duration);
      this.elements.altitudePath.setAttribute('d', buildAltitudePath(this.samples, duration));
    }

    frameTrack(positions) {
      const sphere = Cesium.BoundingSphere.fromPoints(positions);
      const range = Math.max(1200, sphere.radius * 2.25);
      this.viewer.camera.flyToBoundingSphere(sphere, {
        duration: 0,
        offset: new Cesium.HeadingPitchRange(0, -0.6, range),
      });
      this.viewer.scene.requestRender();
    }

    updateAtTime(time) {
      const elapsed = clamp(
        Cesium.JulianDate.secondsDifference(time, this.samples[0].time),
        0,
        this.durationSeconds,
      );
      const current = interpolateSample(this.samples, elapsed);
      this.trailPositions = buildTrail(this.samples, current, this.options.trailLengthMeters);
      if (this.isAutoCameraEnabled) this.applyAutoCamera(elapsed);

      this.elements.altitude.textContent = `${Math.round(current.altitudeMeters)} m`;
      this.elements.speed.textContent = `${(current.speedMps * 3.6).toFixed(1)} km/h`;
      const variometer = calculateVariometer(this.samples, elapsed, 5);
      this.elements.vario.textContent = `${variometer >= 0 ? '+' : ''}${variometer.toFixed(1)} m/s`;
      this.elements.distance.textContent = `${(current.distanceMeters / 1000).toFixed(2)} km`;
      this.elements.current.textContent = formatDuration(elapsed);
      this.elements.scrubber.value = String(elapsed);
      this.elements.progress.style.width = `${(elapsed / this.durationSeconds) * 100}%`;
      this.elements.play.classList.toggle('is-playing', this.viewer.clock.shouldAnimate);
      this.viewer.scene.requestRender();
    }

    bindControls() {
      this.elements.play.addEventListener('click', () => {
        const clock = this.viewer.clock;
        clock.shouldAnimate = !clock.shouldAnimate;
        this.elements.play.classList.toggle('is-playing', clock.shouldAnimate);
        this.elements.play.setAttribute(
          'aria-label',
          clock.shouldAnimate ? 'Pause flight' : 'Play flight',
        );
        this.viewer.scene.requestRender();
      });
      this.elements.scrubber.addEventListener('input', (event) => {
        this.viewer.clock.shouldAnimate = false;
        this.viewer.clock.currentTime = Cesium.JulianDate.addSeconds(
          this.samples[0].time,
          Number(event.target.value),
          new Cesium.JulianDate(),
        );
        this.updateAtTime(this.viewer.clock.currentTime);
      });
      this.elements.fullscreen.addEventListener('click', () => this.toggleFullscreen());
      this.elements.map.addEventListener('pointerdown', () => this.useManualCamera());
      this.elements.map.addEventListener('wheel', () => this.useManualCamera(), { passive: true });
      document.addEventListener('fullscreenchange', () => this.updateFullscreenButton());
    }

    useManualCamera() {
      if (!this.isAutoCameraEnabled) return;
      this.isAutoCameraEnabled = false;
      this.container.dataset.cameraMode = 'manual';
    }

    applyAutoCamera(elapsedSeconds) {
      const settings = this.options.camera;
      const flightRate = this.options.playbackRate;
      const focusTime = elapsedSeconds - settings.lagSeconds * flightRate;
      const focus = smoothSample(
        this.samples,
        focusTime,
        settings.followSmoothingSeconds * flightRate,
      );
      const target = smoothSample(
        this.samples,
        focusTime + settings.lookAheadSeconds * flightRate,
        settings.followSmoothingSeconds * flightRate,
      );
      const destination = calculateCameraDestination(focus, target, settings);
      this.applyTerrainClearance(destination, settings.minimumTerrainClearanceMeters);
      applyCameraView(this.viewer, destination, target.position, settings.fieldOfViewDegrees);
      this.container.dataset.cameraMode = 'auto';
    }

    applyTerrainClearance(destination, minimumClearanceMeters) {
      const cartographic = Cesium.Cartographic.fromCartesian(destination);
      const terrainHeight = this.viewer.scene.globe.getHeight(cartographic);
      if (terrainHeight === undefined) return;
      cartographic.height = Math.max(cartographic.height, terrainHeight + minimumClearanceMeters);
      Cesium.Cartesian3.fromRadians(
        cartographic.longitude,
        cartographic.latitude,
        cartographic.height,
        undefined,
        destination,
      );
    }

    async toggleFullscreen() {
      if (document.fullscreenElement === this.container) await document.exitFullscreen();
      else await this.container.requestFullscreen();
    }

    updateFullscreenButton() {
      const isFullscreen = document.fullscreenElement === this.container;
      this.elements.fullscreen.setAttribute(
        'aria-label',
        isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen',
      );
      this.container.classList.toggle('is-fullscreen', isFullscreen);
      if (this.viewer) window.setTimeout(() => this.viewer.resize(), 0);
    }

    setStatus(message) {
      this.elements.status.textContent = message;
    }

    showError(message) {
      this.elements.loading.hidden = true;
      this.elements.error.hidden = false;
      this.elements.error.textContent = message;
      console.error(`IGC viewer: ${message}`);
    }

    get durationSeconds() {
      return Cesium.JulianDate.secondsDifference(this.samples.at(-1).time, this.samples[0].time);
    }

    destroy() {
      if (this.tickListener && this.viewer) {
        this.viewer.clock.onTick.removeEventListener(this.tickListener);
      }
      if (this.viewer && !this.viewer.isDestroyed()) this.viewer.destroy();
      instances.delete(this.options.targetElementId);
    }
  }

  function parseIgc(text) {
    if (!text.trim()) throw new Error('The IGC file is empty.');
    const lines = normalizeIgcLines(text);
    const date = parseFlightDate(lines);
    const samples = [];
    const recordCounts = { fix: 0, malformed: 0, invalid: 0 };
    let dayOffset = 0;
    let previousSeconds = -1;

    for (const line of lines) {
      if (!line.startsWith('B')) continue;
      recordCounts.fix += 1;
      const fix = parseFix(line);
      if (!fix) {
        recordCounts.malformed += 1;
        continue;
      }
      if (!fix.valid) {
        recordCounts.invalid += 1;
        continue;
      }
      if (previousSeconds >= 0 && fix.secondsOfDay < previousSeconds - 43200) dayOffset += 86400;
      const time = Cesium.JulianDate.fromDate(
        new Date(date + (dayOffset + fix.secondsOfDay) * 1000),
      );
      if (samples.at(-1) && Cesium.JulianDate.compare(time, samples.at(-1).time) <= 0) continue;
      const position = Cesium.Cartesian3.fromDegrees(
        fix.longitude,
        fix.latitude,
        fix.altitudeMeters,
      );
      samples.push({
        ...fix,
        time,
        position,
        cartographic: Cesium.Cartographic.fromCartesian(position),
        elapsedSeconds: 0,
        distanceMeters: 0,
        speedMps: 0,
      });
      previousSeconds = fix.secondsOfDay;
    }

    assertEnoughSamples(samples, recordCounts);
    const start = samples[0].time;
    for (const sample of samples)
      sample.elapsedSeconds = Cesium.JulianDate.secondsDifference(sample.time, start);
    return samples;
  }

  function normalizeIgcLines(text) {
    return text
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
      .split('\n')
      .map((line) => line.trim());
  }

  function assertEnoughSamples(samples, counts) {
    if (samples.length >= 2) return;
    if (counts.fix === 0) {
      throw new Error(
        'The fetched file contains no IGC B records. Check that the track URL returns raw IGC text rather than an HTML page.',
      );
    }
    throw new Error(
      `The IGC file contains ${samples.length} usable fixes from ${counts.fix} B records (${counts.malformed} malformed, ${counts.invalid} marked invalid); at least 2 are required.`,
    );
  }

  function parseFlightDate(lines) {
    const header = lines.find((line) => line.startsWith('HFDTE'));
    const match = header?.slice(5).match(/(\d{2})(\d{2})(\d{2})/);
    if (!match) return Date.UTC(1970, 0, 1);
    const year = Number(match[3]) >= 70 ? 1900 + Number(match[3]) : 2000 + Number(match[3]);
    return Date.UTC(year, Number(match[2]) - 1, Number(match[1]));
  }

  function parseFix(line) {
    if (!line.startsWith('B') || line.length < 35) return null;
    const hours = parseDigits(line.slice(1, 3));
    const minutes = parseDigits(line.slice(3, 5));
    const seconds = parseDigits(line.slice(5, 7));
    const latitude = parseCoordinate(line.slice(7, 14), line[14], 2);
    const longitude = parseCoordinate(line.slice(15, 23), line[23], 3);
    const pressureAltitude = parseSignedDigits(line.slice(25, 30));
    const gnssAltitude = parseSignedDigits(line.slice(30, 35));
    if ([hours, minutes, seconds, latitude, longitude].some((value) => value === null)) return null;
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    return {
      secondsOfDay: hours * 3600 + minutes * 60 + seconds,
      latitude,
      longitude,
      altitudeMeters: gnssAltitude ?? pressureAltitude ?? 0,
      valid: line[24] === 'A',
    };
  }

  function parseCoordinate(value, hemisphere, degreeDigits) {
    if (!/^\d+$/.test(value) || !'NSEW'.includes(hemisphere ?? '')) return null;
    const degrees = Number(value.slice(0, degreeDigits));
    const minutes = Number(value.slice(degreeDigits, degreeDigits + 2));
    const thousandths = Number(value.slice(degreeDigits + 2));
    if (minutes >= 60) return null;
    const coordinate = degrees + (minutes + thousandths / 1000) / 60;
    return hemisphere === 'S' || hemisphere === 'W' ? -coordinate : coordinate;
  }

  function parseDigits(value) {
    return /^\d+$/.test(value) ? Number(value) : null;
  }

  function parseSignedDigits(value) {
    return /^-?\d+$/.test(value) ? Number(value) : null;
  }

  function interpolateSample(samples, elapsedSeconds) {
    elapsedSeconds = clamp(elapsedSeconds, 0, samples.at(-1).elapsedSeconds);
    const lowerIndex = findLowerSampleIndex(samples, elapsedSeconds);
    const lower = samples[lowerIndex];
    const upper = samples[Math.min(lowerIndex + 1, samples.length - 1)];
    const duration = upper.elapsedSeconds - lower.elapsedSeconds;
    const fraction = duration > 0 ? (elapsedSeconds - lower.elapsedSeconds) / duration : 0;
    return {
      lowerIndex,
      position: Cesium.Cartesian3.lerp(
        lower.position,
        upper.position,
        fraction,
        new Cesium.Cartesian3(),
      ),
      altitudeMeters: lerp(lower.altitudeMeters, upper.altitudeMeters, fraction),
      speedMps: lerp(lower.speedMps, upper.speedMps, fraction),
      distanceMeters: lerp(lower.distanceMeters, upper.distanceMeters, fraction),
    };
  }

  function findLowerSampleIndex(samples, elapsedSeconds) {
    let low = 0;
    let high = samples.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (samples[middle].elapsedSeconds <= elapsedSeconds) low = middle;
      else high = middle - 1;
    }
    return Math.min(low, samples.length - 2);
  }

  function buildTrail(samples, current, maximumLengthMeters) {
    const startDistance = Math.max(0, current.distanceMeters - maximumLengthMeters);
    let startIndex = current.lowerIndex;
    while (startIndex > 0 && samples[startIndex].distanceMeters > startDistance) startIndex -= 1;
    return [
      ...samples.slice(startIndex, current.lowerIndex + 1).map((sample) => sample.position),
      current.position,
    ];
  }

  function smoothSample(samples, elapsedSeconds, windowSeconds) {
    if (windowSeconds <= 0) return interpolateSample(samples, elapsedSeconds);
    const offsets = [-2, -1, 0, 1, 2];
    const weights = [0.0545, 0.2442, 0.4026, 0.2442, 0.0545];
    const position = new Cesium.Cartesian3(0, 0, 0);
    const weighted = new Cesium.Cartesian3();
    offsets.forEach((offset, index) => {
      const sample = interpolateSample(samples, elapsedSeconds + offset * windowSeconds);
      Cesium.Cartesian3.multiplyByScalar(sample.position, weights[index], weighted);
      Cesium.Cartesian3.add(position, weighted, position);
    });
    return { position };
  }

  function calculateCameraDestination(focus, target, settings) {
    const frame = Cesium.Transforms.eastNorthUpToFixedFrame(focus.position);
    const heading = calculateOrbitHeading(frame, target.position, settings);
    const elevation = Cesium.Math.toRadians(settings.elevationAngleDegrees);
    const horizontalDistance = Math.cos(elevation) * settings.distanceMeters;
    const localOffset = new Cesium.Cartesian3(
      -Math.sin(heading) * horizontalDistance,
      -Math.cos(heading) * horizontalDistance,
      Math.sin(elevation) * settings.distanceMeters,
    );
    return Cesium.Matrix4.multiplyByPoint(frame, localOffset, new Cesium.Cartesian3());
  }

  function calculateOrbitHeading(frame, targetPosition, settings) {
    if (settings.fixedHeadingEnabled) return Cesium.Math.toRadians(settings.fixedHeadingDegrees);
    const inverseFrame = Cesium.Matrix4.inverseTransformation(frame, new Cesium.Matrix4());
    const localTarget = Cesium.Matrix4.multiplyByPoint(
      inverseFrame,
      targetPosition,
      new Cesium.Cartesian3(),
    );
    const trackHeading = Math.atan2(localTarget.x, localTarget.y);
    return trackHeading + Cesium.Math.toRadians(settings.headingOffsetDegrees);
  }

  function applyCameraView(viewer, destination, target, fieldOfViewDegrees) {
    const direction = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(target, destination, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    const geodeticUp = Cesium.Cartesian3.normalize(destination, new Cesium.Cartesian3());
    const right = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(direction, geodeticUp, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    const up = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    viewer.camera.setView({ destination, orientation: { direction, up } });
    if (viewer.camera.frustum instanceof Cesium.PerspectiveFrustum) {
      viewer.camera.frustum.fov = Cesium.Math.toRadians(fieldOfViewDegrees);
    }
  }

  function calculateVariometer(samples, elapsedSeconds, windowSeconds) {
    const current = interpolateSample(samples, elapsedSeconds);
    const startSeconds = Math.max(0, elapsedSeconds - windowSeconds);
    const start = interpolateSample(samples, startSeconds);
    const duration = elapsedSeconds - startSeconds;
    return duration > 0 ? (current.altitudeMeters - start.altitudeMeters) / duration : 0;
  }

  function buildAltitudePath(samples, durationSeconds) {
    const minimum = Math.min(...samples.map((sample) => sample.altitudeMeters));
    const maximum = Math.max(...samples.map((sample) => sample.altitudeMeters));
    const range = Math.max(1, maximum - minimum);
    const stride = Math.max(1, Math.floor(samples.length / 400));
    const selected = samples.filter((_, index) => index % stride === 0);
    if (selected.at(-1) !== samples.at(-1)) selected.push(samples.at(-1));
    const points = selected.map((sample) => {
      const x = (sample.elapsedSeconds / durationSeconds) * 1000;
      const y = 72 - ((sample.altitudeMeters - minimum) / range) * 58;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M 0,80 L ${points.join(' L ')} L 1000,80 Z`;
  }

  function formatDuration(seconds) {
    const rounded = Math.max(0, Math.round(seconds));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const remainder = rounded % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
      : `${minutes}:${String(remainder).padStart(2, '0')}`;
  }

  function lerp(start, end, fraction) {
    return start + (end - start) * fraction;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  async function initIgcViewer(options) {
    const existing = instances.get(options.targetElementId);
    if (existing) return existing;
    const camera = { ...DEFAULT_CAMERA, ...options.camera };
    const viewer = new IgcViewer({
      playbackRate: 10,
      trailLengthMeters: 5000,
      showGhostRoute: false,
      ...options,
      camera,
    });
    instances.set(options.targetElementId, viewer);
    await viewer.initialize();
    return viewer;
  }

  function initializeMarkup() {
    document.querySelectorAll(SELECTOR).forEach((element) => {
      if (element.dataset.viewerInitialized === 'true') return;
      element.dataset.viewerInitialized = 'true';
      element.dataset.viewerVersion = VERSION;
      initIgcViewer({
        targetElementId: element.id,
        igcFileUrl: element.dataset.track,
        cesiumToken: element.dataset.token,
      }).catch(() => {
        element.dataset.viewerInitialized = 'error';
      });
    });
  }

  window.initIgcViewer = initIgcViewer;
  window.IgcViewer = IgcViewer;
  window.IgcViewer.parseIgc = parseIgc;
  window.IgcViewer.version = VERSION;
  window.IgcViewer.defaultCamera = DEFAULT_CAMERA;
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initializeMarkup);
  else initializeMarkup();
})();
