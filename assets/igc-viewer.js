class IgcViewer {
  constructor(options) {
    this.targetElementId = options.targetElementId;
    this.igcFileUrl = options.igcFileUrl;
    this.cesiumToken =
      options.cesiumToken ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2ZTM1OThjYi1mNTU4LTRmNDctOWNhNS0wNWI2MTA1ZGU2NjIiLCJpZCI6Mjk3MzE1LCJpYXQiOjE3NDU2MjYwNTd9.aJytwthdrinNHz2hVJ5J-Ry62xFzy4alE_-uVgWvg9U";

    this.viewer = null;
    this.currentPolylineCollection = null;
    this.clockTickListener = null;
    this.trailSegments = [];
    this.timePositionSamples = [];
    this.currentFlightPathEntity = null;

    this.containerElement = document.getElementById(this.targetElementId);
    if (!this.containerElement) {
      throw new Error(
        `Target element with ID "${this.targetElementId}" not found.`
      );
    }
  }

  async initialize() {
    if (!this.containerElement) return;

    this.initUI();

    try {
      await this.initCesium();

      if (!this.viewer) {
        throw new Error("Cesium Viewer object was not created.");
      }

      await this.loadIgcData();
    } catch (error) {
      console.error("Initialization failed:", error);

      throw error;
    }
  }

  initUI() {
    this.cesiumContainer =
      this.containerElement.querySelector(".cesium-container");
    this.infoBox = this.containerElement.querySelector(".igc-viewer-infobox");
  }

  async initCesium() {
    Cesium.Ion.defaultAccessToken = this.cesiumToken;
    try {
      this.viewer = new Cesium.Viewer(this.cesiumContainer, {
        terrainProvider: await Cesium.createWorldTerrainAsync(),
        scene3DOnly: true,
        animation: false,
        baseLayerPicker: false,
        timeline: true,
        infoBox: true,
        selectionIndicator: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
      });
    } catch (error) {
      console.error("Error initializing Cesium Viewer:", error);
      this.showError(
        `Failed to initialize Cesium Viewer: ${error.message}. Check console for details.`
      );
      throw error;
    }
  }

  showLoading(show) {
    if (show) {
      console.log("Loading and processing file...");
    }
  }

  showError(message) {
    console.error(`Error: ${message}`);
    if (this.infoBox) {
      this.infoBox.innerHTML = `Altitude: --- m<br>Speed: --- km/h<br>Distance: --- km`;
    }
  }

  async loadIgcData() {
    if (!this.viewer) {
      console.error("loadIgcData called before Cesium viewer was initialized.");
      this.showError("Cannot load data: Viewer not ready.");
      return;
    }

    this.showLoading(true);
    this.cleanupPreviousFlight();

    try {
      const response = await fetch(this.igcFileUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch IGC file: ${response.status} ${response.statusText}`
        );
      }
      const igcContent = await response.text();

      this.timePositionSamples = this.parseIGC(igcContent);

      if (this.timePositionSamples.length > 1) {
        const adjustedTimePositionSamples =
          await this.adjustAltitudeAndCalculateMetrics(
            this.timePositionSamples
          );

        this.timePositionSamples = adjustedTimePositionSamples;
        this.displayFlightPath(adjustedTimePositionSamples);
      } else {
        throw new Error("Not enough valid positions found in the IGC file.");
      }
      this.showLoading(false);
    } catch (error) {
      console.error("Error loading or processing IGC file:", error);
      this.showError(error.message);
    }
  }

  cleanupPreviousFlight() {
    if (!this.viewer) return;
    if (this.currentFlightPathEntity) {
      this.viewer.entities.remove(this.currentFlightPathEntity);
      this.currentFlightPathEntity = null;
    }
    if (this.currentPolylineCollection) {
      if (this.viewer.scene && this.viewer.scene.primitives) {
        this.viewer.scene.primitives.remove(this.currentPolylineCollection);
      }
      this.currentPolylineCollection = null;
    }
    if (this.clockTickListener) {
      if (this.viewer.clock) {
        this.viewer.clock.onTick.removeEventListener(this.clockTickListener);
      }
      this.clockTickListener = null;
    }
    this.trailSegments = [];
    this.timePositionSamples = [];
  }

  parseIGC(igcData) {
    const lines = igcData.split("\n");
    const samples = [];
    let flightDate = null;

    const hfdteRegex = /^HFDTE(\d{2})(\d{2})(\d{2})/;
    const bRecordRegex = /^B(\d{6})(\d{7})([NS])(\d{8})([EW])A(\d{5})(\d{5})/;

    for (const line of lines) {
      const hfdteMatch = line.trim().match(hfdteRegex);
      if (hfdteMatch) {
        const day = hfdteMatch[1];
        const month = hfdteMatch[2];
        const year = `20${hfdteMatch[3]}`;
        flightDate = `${year}-${month}-${day}`;
        break;
      }
    }

    if (!flightDate) {
      console.warn(
        "HFDTE record not found or invalid in IGC file. Using today's date."
      );
      const today = new Date().toISOString().split("T")[0];
      flightDate = today;
    }

    for (const line of lines) {
      const match = line.trim().match(bRecordRegex);
      if (match && flightDate) {
        try {
          const time = match[1];
          const latStr = match[2];
          const latHemisphere = match[3];
          const lonStr = match[4];
          const lonHemisphere = match[5];
          const altGps = parseInt(match[7], 10);

          const hours = time.substring(0, 2);
          const minutes = time.substring(2, 4);
          const seconds = time.substring(4, 6);
          const isoTimestamp = `${flightDate}T${hours}:${minutes}:${seconds}Z`;
          const julianDate = Cesium.JulianDate.fromIso8601(isoTimestamp);

          const latDeg = parseInt(latStr.substring(0, 2), 10);
          const latMin = parseFloat(latStr.substring(2)) / 1000;
          let latitude = latDeg + latMin / 60.0;
          if (latHemisphere === "S") latitude = -latitude;

          const lonDeg = parseInt(lonStr.substring(0, 3), 10);
          const lonMin = parseFloat(lonStr.substring(3)) / 1000;
          let longitude = lonDeg + lonMin / 60.0;
          if (lonHemisphere === "W") longitude = -longitude;

          const altitude = altGps;

          const position = Cesium.Cartesian3.fromDegrees(
            longitude,
            latitude,
            altitude
          );

          samples.push({
            time: julianDate,
            position: position,
            originalAltitude: altGps,
          });
        } catch (parseError) {
          console.warn(
            `Skipping invalid B-record line or timestamp: "${line.trim()}" - Error: ${
              parseError.message
            }`
          );
        }
      }
    }

    samples.sort((a, b) => Cesium.JulianDate.compare(a.time, b.time));

    return samples;
  }

  async adjustAltitudeAndCalculateMetrics(samples) {
    if (!this.viewer || !this.viewer.terrainProvider) {
      console.error(
        "adjustAltitudeAndCalculateMetrics called without a valid viewer or terrain provider."
      );
      throw new Error(
        "Viewer or terrain provider not available for altitude adjustment."
      );
    }

    const firstSample = samples[0];
    const firstCartographic = Cesium.Cartographic.fromCartesian(
      firstSample.position
    );
    const originalGpsHeight = firstSample.originalAltitude;

    const terrainProvider = this.viewer.terrainProvider;
    let adjustedTimePositionSamples = [...samples];

    try {
      const updatedCartographics = await Cesium.sampleTerrainMostDetailed(
        terrainProvider,
        [firstCartographic]
      );
      const terrainHeight = updatedCartographics[0].height;

      if (terrainHeight !== undefined && terrainHeight !== null) {
        const altitudeOffset = terrainHeight - originalGpsHeight;

        adjustedTimePositionSamples = samples.map((sample) => {
          const cartographic = Cesium.Cartographic.fromCartesian(
            sample.position
          );
          cartographic.height = sample.originalAltitude + altitudeOffset;
          const adjustedPosition = Cesium.Cartesian3.fromRadians(
            cartographic.longitude,
            cartographic.latitude,
            cartographic.height
          );
          return { ...sample, position: adjustedPosition };
        });
        console.log(`Applied altitude offset: ${altitudeOffset.toFixed(2)}m`);
      } else {
        console.warn(
          "Could not get terrain height for the first point. Using original GPS altitudes for path display."
        );
        adjustedTimePositionSamples = samples.map((sample) => ({ ...sample }));
      }
    } catch (terrainError) {
      console.error("Error sampling terrain:", terrainError);
      console.warn(
        "Proceeding with original GPS altitudes due to terrain sampling error."
      );
      adjustedTimePositionSamples = samples.map((sample) => ({ ...sample }));
    }

    adjustedTimePositionSamples.forEach((sample) => {
      sample.cumulativeDistance = 0;
      sample.speed = 0;
    });

    let cumulativeDistance = 0;
    adjustedTimePositionSamples[0].cumulativeDistance = 0;
    adjustedTimePositionSamples[0].speed = 0;

    for (let i = 1; i < adjustedTimePositionSamples.length; i++) {
      const p1 = adjustedTimePositionSamples[i - 1];
      const p2 = adjustedTimePositionSamples[i];

      const distance = Cesium.Cartesian3.distance(p1.position, p2.position);
      const timeDiff = Cesium.JulianDate.secondsDifference(p2.time, p1.time);

      cumulativeDistance += distance;
      adjustedTimePositionSamples[i].cumulativeDistance = cumulativeDistance;

      if (timeDiff > 0) {
        adjustedTimePositionSamples[i].speed = distance / timeDiff;
      } else {
        adjustedTimePositionSamples[i].speed =
          adjustedTimePositionSamples[i - 1].speed;
      }
    }

    return adjustedTimePositionSamples;
  }

  getColorForSpeed(speed) {
    const minSpeed = 0;
    const midSpeed = 7.5;
    const maxSpeed = 15;

    let t;
    let startColor, endColor;

    if (speed <= minSpeed) {
      return Cesium.Color.LIME;
    } else if (speed < midSpeed) {
      t = (speed - minSpeed) / (midSpeed - minSpeed);
      startColor = Cesium.Color.LIME;
      endColor = Cesium.Color.YELLOW;
    } else if (speed < maxSpeed) {
      t = (speed - midSpeed) / (maxSpeed - midSpeed);
      startColor = Cesium.Color.YELLOW;
      endColor = Cesium.Color.RED;
    } else {
      return Cesium.Color.RED;
    }

    const r = Cesium.Math.lerp(startColor.red, endColor.red, t);
    const g = Cesium.Math.lerp(startColor.green, endColor.green, t);
    const b = Cesium.Math.lerp(startColor.blue, endColor.blue, t);

    return new Cesium.Color(r, g, b, 1.0);
  }

  updateInfoBox(currentTime) {
    if (!this.timePositionSamples || this.timePositionSamples.length < 1) {
      this.infoBox.innerHTML = `Altitude: --- m<br>Speed: --- km/h<br>Distance: --- km`;
      return;
    }

    let currentAltitude = 0;
    let currentSpeed = 0;
    let currentDistance = 0;

    let index = -1;
    if (
      Cesium.JulianDate.lessThan(currentTime, this.timePositionSamples[0].time)
    ) {
      index = 0;
    } else {
      for (let i = 0; i < this.timePositionSamples.length - 1; i++) {
        if (
          Cesium.JulianDate.lessThanOrEquals(
            this.timePositionSamples[i].time,
            currentTime
          ) &&
          Cesium.JulianDate.lessThan(
            currentTime,
            this.timePositionSamples[i + 1].time
          )
        ) {
          index = i;
          break;
        }
      }
      if (
        index === -1 &&
        this.timePositionSamples.length > 0 &&
        Cesium.JulianDate.greaterThanOrEquals(
          currentTime,
          this.timePositionSamples[this.timePositionSamples.length - 1].time
        )
      ) {
        index = this.timePositionSamples.length - 1;
      }
    }

    if (index !== -1) {
      const sample1 = this.timePositionSamples[index];

      if (
        index === this.timePositionSamples.length - 1 ||
        (index === 0 &&
          Cesium.JulianDate.lessThanOrEquals(currentTime, sample1.time))
      ) {
        currentAltitude = Number.isFinite(sample1.originalAltitude)
          ? sample1.originalAltitude
          : 0;
        currentDistance = Number.isFinite(sample1.cumulativeDistance)
          ? sample1.cumulativeDistance
          : 0;
        currentSpeed = Number.isFinite(sample1.speed) ? sample1.speed : 0;
      } else {
        const sample2 = this.timePositionSamples[index + 1];
        const timeDiffSegment = Cesium.JulianDate.secondsDifference(
          sample2.time,
          sample1.time
        );

        if (timeDiffSegment > 0) {
          const timeRatio =
            Cesium.JulianDate.secondsDifference(currentTime, sample1.time) /
            timeDiffSegment;

          currentAltitude = Cesium.Math.lerp(
            sample1.originalAltitude,
            sample2.originalAltitude,
            timeRatio
          );
          currentDistance = Cesium.Math.lerp(
            sample1.cumulativeDistance,
            sample2.cumulativeDistance,
            timeRatio
          );
          currentSpeed = Cesium.Math.lerp(
            sample1.speed,
            sample2.speed,
            timeRatio
          );
        } else {
          currentAltitude = Number.isFinite(sample1.originalAltitude)
            ? sample1.originalAltitude
            : 0;
          currentDistance = Number.isFinite(sample1.cumulativeDistance)
            ? sample1.cumulativeDistance
            : 0;
          currentSpeed = Number.isFinite(sample1.speed) ? sample1.speed : 0;
        }
      }
    } else if (this.timePositionSamples.length > 0) {
      const lastSample =
        this.timePositionSamples[this.timePositionSamples.length - 1];
      currentAltitude = Number.isFinite(lastSample.originalAltitude)
        ? lastSample.originalAltitude
        : 0;
      currentDistance = Number.isFinite(lastSample.cumulativeDistance)
        ? lastSample.cumulativeDistance
        : 0;
      currentSpeed = Number.isFinite(lastSample.speed) ? lastSample.speed : 0;
    }

    this.infoBox.innerHTML = `
            Altitude: ${currentAltitude.toFixed(0)} m<br>
            Speed: ${(currentSpeed * 3.6).toFixed(1)} km/h<br>
            Distance: ${(currentDistance / 1000).toFixed(2)} km
        `;
  }

  displayFlightPath(adjustedTimePositionSamples) {
    if (!this.viewer) {
      console.error(
        "displayFlightPath called before Cesium viewer was initialized."
      );
      this.showError("Cannot display path: Viewer not ready.");
      return;
    }

    if (
      !adjustedTimePositionSamples ||
      adjustedTimePositionSamples.length < 2
    ) {
      this.showError(
        "Not enough valid time/position points found to display flight path."
      );
      this.infoBox.innerHTML = `Altitude: --- m<br>Speed: --- km/h<br>Distance: --- km`;
      return;
    }

    const positionProperty = new Cesium.SampledPositionProperty();
    adjustedTimePositionSamples.forEach((sample) => {
      positionProperty.addSample(sample.time, sample.position);
    });

    const startTime = adjustedTimePositionSamples[0].time;
    const stopTime =
      adjustedTimePositionSamples[adjustedTimePositionSamples.length - 1].time;

    this.viewer.clock.startTime = startTime;
    this.viewer.clock.stopTime = stopTime;
    this.viewer.clock.currentTime = startTime;
    this.viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
    this.viewer.clock.multiplier = 10;
    this.viewer.timeline.zoomTo(startTime, stopTime);

    this.currentFlightPathEntity = this.viewer.entities.add({
      name: "Paraglider Flight Path",
      availability: new Cesium.TimeIntervalCollection([
        new Cesium.TimeInterval({
          start: startTime,
          stop: stopTime,
        }),
      ]),
      position: positionProperty,
      orientation: new Cesium.VelocityOrientationProperty(positionProperty),
      point: {
        pixelSize: 10,
        color: Cesium.Color.RED,
      },
      ellipsoid: {
        radii: new Cesium.Cartesian3(150, 150, 150),
        material: Cesium.Color.TRANSPARENT,
        outline: false,
      },
    });

    this.currentPolylineCollection = new Cesium.PolylineCollection();
    this.viewer.scene.primitives.add(this.currentPolylineCollection);
    this.trailSegments = [];

    for (let i = 1; i < adjustedTimePositionSamples.length; i++) {
      const p1_adj = adjustedTimePositionSamples[i - 1];
      const p2_adj = adjustedTimePositionSamples[i];
      const speed = p2_adj.speed;
      const color = this.getColorForSpeed(speed);

      const polyline = this.currentPolylineCollection.add({
        positions: [p1_adj.position, p2_adj.position],
        width: 5,
        material: Cesium.Material.fromType("Color", {
          color: color,
        }),
        show: false,
      });

      this.trailSegments.push({
        polyline: polyline,
        startTime: p1_adj.time,
        endTime: p2_adj.time,
        startIndex: i - 1,
        endIndex: i,
      });
    }

    this.viewer.zoomTo(this.currentFlightPathEntity);
    this.viewer.trackedEntity = this.currentFlightPathEntity;
    this.viewer.clock.shouldAnimate = true;

    if (this.clockTickListener) {
      this.viewer.clock.onTick.removeEventListener(this.clockTickListener);
    }

    this.clockTickListener = (clock) => {
      const currentTime = clock.currentTime;

      let lastVisibleIndex = -1;
      for (let i = 0; i < this.trailSegments.length; i++) {
        const segment = this.trailSegments[i];
        const show = Cesium.JulianDate.lessThanOrEquals(
          segment.startTime,
          currentTime
        );
        segment.polyline.show = show;
        if (show) lastVisibleIndex = i;
      }

      if (lastVisibleIndex >= 0 && this.currentFlightPathEntity) {
        const currentEntityPosition =
          this.currentFlightPathEntity.position.getValue(currentTime);

        for (let i = 0; i < lastVisibleIndex; i++) {
          const seg = this.trailSegments[i];
          seg.polyline.positions = [
            adjustedTimePositionSamples[seg.startIndex].position,
            adjustedTimePositionSamples[seg.endIndex].position,
          ];
        }

        const lastSeg = this.trailSegments[lastVisibleIndex];
        if (
          currentEntityPosition &&
          Cesium.JulianDate.lessThan(currentTime, lastSeg.endTime)
        ) {
          lastSeg.polyline.positions = [
            adjustedTimePositionSamples[lastSeg.startIndex].position,
            currentEntityPosition,
          ];

          if (lastVisibleIndex + 1 < this.trailSegments.length) {
            this.trailSegments[lastVisibleIndex + 1].polyline.show = false;
          }
        } else {
          lastSeg.polyline.positions = [
            adjustedTimePositionSamples[lastSeg.startIndex].position,
            adjustedTimePositionSamples[lastSeg.endIndex].position,
          ];
        }
      }

      this.updateInfoBox(currentTime);
    };
    this.viewer.clock.onTick.addEventListener(this.clockTickListener);

    this.updateInfoBox(startTime);
  }

  destroy() {
    this.cleanupPreviousFlight();
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.destroy();
    }
    if (this.containerElement) {
      this.containerElement.innerHTML = "";
      this.containerElement.classList.remove("igc-viewer-container");
    }
    this.viewer = null;
    this.containerElement = null;
  }
}

window.initIgcViewer = async (options) => {
  const viewerInstance = new IgcViewer(options);
  await viewerInstance.initialize();
  return viewerInstance;
};
