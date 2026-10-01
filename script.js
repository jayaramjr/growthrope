const revealItems = document.querySelectorAll('.reveal');

const replaceFeatherIcons = () => {
  if (window.feather) {
    window.feather.replace();
  }
};

replaceFeatherIcons();
window.addEventListener('load', replaceFeatherIcons);
window.setTimeout(replaceFeatherIcons, 250);

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  },
  { threshold: 0.12 }
);

revealItems.forEach((item) => observer.observe(item));

const statNumbers = document.querySelectorAll('.stat-number');

const globeCanvas = document.querySelector('#globe-canvas');

function initGlobe() {
  if (!globeCanvas || !window.THREE) return;

  const globeStage = globeCanvas.parentElement;
  const countryLabel = globeStage.querySelector('.globe-country');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  let renderer;
  const globe = new THREE.Group();
  const radius = 1.75;
  const states = [
    { name: 'India', lat: 22, lng: 79 },
    { name: 'UAE', lat: 24, lng: 54 },
    { name: 'UK', lat: 55, lng: -3 },
    { name: 'USA', lat: 38, lng: -97 },
  ];

  try {
    renderer = new THREE.WebGLRenderer({ canvas: globeCanvas, alpha: true, antialias: true });
  } catch (error) {
    let fallbackState = 0;
    setInterval(() => {
      fallbackState = (fallbackState + 1) % states.length;
      countryLabel.textContent = states[fallbackState].name;
    }, 5000);
    globeStage.classList.add('webgl-fallback');
    return;
  }

  camera.position.z = 6.5;
  scene.add(globe);

  const latLngToVector = (lat, lng, distance = radius) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -distance * Math.sin(phi) * Math.cos(theta),
      distance * Math.cos(phi),
      distance * Math.sin(phi) * Math.sin(theta)
    );
  };

  const dotPositions = [];
  const landPoints = typeof GLOBE_LAND_POINTS !== 'undefined' ? GLOBE_LAND_POINTS : [];
  for (let i = 0; i < landPoints.length; i += 2) {
    dotPositions.push(...latLngToVector(landPoints[i], landPoints[i + 1], radius).toArray());
  }

  const dotsGeometry = new THREE.BufferGeometry();
  dotsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dotPositions, 3));
  const dotColors = new Float32Array(dotPositions.length);
  dotsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(dotColors, 3));
  const dots = new THREE.Points(
    dotsGeometry,
    new THREE.PointsMaterial({ size: 0.032, vertexColors: true, transparent: true, opacity: 1, sizeAttenuation: true })
  );
  globe.add(dots);

  const dotFaceColor = new THREE.Color(0x35d985);
  const dotBackColor = new THREE.Color(0x0d5c3d);
  const dotShadeColor = new THREE.Color();
  const dotPositionArray = dotsGeometry.attributes.position.array;
  const dotColorArray = dotsGeometry.attributes.color.array;

  const shadeGlobeDots = () => {
    const cosR = Math.cos(globe.rotation.y);
    const sinR = Math.sin(globe.rotation.y);
    for (let i = 0; i < dotPositionArray.length; i += 3) {
      const x = dotPositionArray[i];
      const z = dotPositionArray[i + 2];
      const facing = (x * sinR + z * cosR) / radius;
      const t = THREE.MathUtils.clamp(facing * 0.65 + 0.55, 0, 1);
      dotShadeColor.copy(dotBackColor).lerp(dotFaceColor, t);
      dotColorArray[i] = dotShadeColor.r;
      dotColorArray[i + 1] = dotShadeColor.g;
      dotColorArray[i + 2] = dotShadeColor.b;
    }
    dotsGeometry.attributes.color.needsUpdate = true;
  };
  shadeGlobeDots();

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(radius - 0.015, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x1aa765, transparent: true, opacity: 0.035, wireframe: true })
  );
  globe.add(shell);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.08, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x1aa765, transparent: true, opacity: 0.07, side: THREE.BackSide })
  );
  globe.add(atmosphere);

  const focusPoint = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  globe.add(focusPoint);

  const focusRing = new THREE.Mesh(
    new THREE.RingGeometry(0.11, 0.13, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  globe.add(focusRing);

  const traveler = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
  );
  globe.add(traveler);

  let connection = null;
  let travelCurve = null;
  let travelStart = 0;
  let activeState = 0;
  let targetRotation = 0;
  let targetTilt = 0;

  const setState = (index) => {
    const state = states[index];
    activeState = index;
    countryLabel.textContent = state.name;
    // Offset by -90deg so the marker's longitude lands on the camera-facing
    // front of the sphere instead of its side silhouette.
    targetRotation = THREE.MathUtils.degToRad(-state.lng - 90);
    targetTilt = THREE.MathUtils.degToRad(Math.max(0, state.lat - 22) * 0.25);
    const point = latLngToVector(state.lat, state.lng, radius + 0.02);
    const nextState = states[(index + 1) % states.length];
    const nextPoint = latLngToVector(nextState.lat, nextState.lng, radius + 0.02);
    const midpoint = point.clone().add(nextPoint).normalize().multiplyScalar(radius + 0.55);
    travelCurve = new THREE.QuadraticBezierCurve3(point, midpoint, nextPoint);
    travelStart = performance.now();

    if (connection) globe.remove(connection);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.24 });
    connection = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(travelCurve.getPoints(40)),
      lineMaterial
    );
    globe.add(connection);
    focusPoint.position.copy(point);
    focusRing.position.copy(point);
    focusRing.lookAt(point.clone().multiplyScalar(2));
    traveler.position.copy(point);
  };

  const resizeGlobe = () => {
    const bounds = globeCanvas.getBoundingClientRect();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(Math.max(bounds.width, 1), Math.max(bounds.height, 1), false);
    camera.aspect = bounds.width / bounds.height;
    camera.updateProjectionMatrix();
  };

  setState(activeState);
  resizeGlobe();
  window.addEventListener('resize', resizeGlobe);

  setInterval(() => setState((activeState + 1) % states.length), 5000);

  const renderGlobe = () => {
    requestAnimationFrame(renderGlobe);
    globe.rotation.y += (targetRotation - globe.rotation.y) * 0.025;
    globe.rotation.x += (targetTilt - globe.rotation.x) * 0.025;
    shadeGlobeDots();
    const beaconTime = performance.now() * 0.003;
    const beaconPulse = (Math.sin(beaconTime) + 1) / 2;
    focusRing.scale.setScalar(0.82 + beaconPulse * 0.3);
    focusRing.material.opacity = 0.3 + beaconPulse * 0.5;
    focusPoint.scale.setScalar(0.9 + beaconPulse * 0.15);
    if (travelCurve) {
      const progress = Math.min((performance.now() - travelStart) / 4700, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      traveler.position.copy(travelCurve.getPointAt(easedProgress));
    }
    renderer.render(scene, camera);
  };

  renderGlobe();
}

initGlobe();

const visualCard = document.querySelector('.visual-card');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (visualCard && !prefersReducedMotion) {
  visualCard.addEventListener('pointermove', (event) => {
    const bounds = visualCard.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;

    visualCard.style.setProperty('--rotate-y', `${x * 5}deg`);
    visualCard.style.setProperty('--rotate-x', `${y * -5}deg`);
  });

  visualCard.addEventListener('pointerleave', () => {
    visualCard.style.setProperty('--rotate-y', '0deg');
    visualCard.style.setProperty('--rotate-x', '0deg');
  });
}

document.querySelectorAll('.btn').forEach((button) => {
  button.addEventListener('click', () => {
    button.classList.remove('ripple');
    requestAnimationFrame(() => button.classList.add('ripple'));
  });
});

const navLinks = [...document.querySelectorAll('.main-nav a')];
const sections = navLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      navLinks.forEach((link) => {
        link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`);
      });
    });
  },
  { rootMargin: '-35% 0px -55% 0px' }
);

sections.forEach((section) => sectionObserver.observe(section));

const animateCounter = (element) => {
  const target = Number(element.dataset.target || 0);
  const duration = 1200;
  const start = performance.now();

  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(target * eased);
    element.textContent = `${value}${target >= 98 ? '%' : '+'}`;

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      element.textContent = `${target}${target >= 98 ? '%' : '+'}`;
    }
  };

  requestAnimationFrame(tick);
};

const statObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        statObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.5 }
);

statNumbers.forEach((number) => statObserver.observe(number));


/* ── Mobile menu toggle ─────────────────────────────────────── */
(function () {
  var toggle = document.querySelector('.menu-toggle');
  var menu   = document.getElementById('mobile-menu');
  if (!toggle || !menu) return;

  function openMenu() {
    toggle.setAttribute('aria-expanded', 'true');
    menu.setAttribute('aria-hidden', 'false');
    menu.classList.add('is-open');
    document.body.classList.add('menu-open');
  }

  function closeMenu() {
    toggle.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-hidden', 'true');
    menu.classList.remove('is-open');
    document.body.classList.remove('menu-open');
  }

  toggle.addEventListener('click', function () {
    if (toggle.getAttribute('aria-expanded') === 'true') closeMenu();
    else openMenu();
  });

  // Close when a nav link is tapped
  menu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', closeMenu);
  });

  // Close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      toggle.focus();
    }
  });

  // Safety: if the viewport is resized back to desktop, close the menu
  window.addEventListener('resize', function () {
    if (window.innerWidth > 800 && menu.classList.contains('is-open')) closeMenu();
  });
})();