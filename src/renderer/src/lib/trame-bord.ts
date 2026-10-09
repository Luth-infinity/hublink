import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderer } from 'three';

/**
 * Le bord vivant de Trame : un halo irisé qui court le long des bords de la
 * fenêtre. Il part du bouton, fait le tour dans les deux sens, et s'élargit
 * pendant que l'IA réfléchit.
 *
 * Un seul quad plein écran et un shader : tout se calcule au pixel, la
 * distance au bord donne la lueur, l'angle autour du centre donne la couleur.
 * Rien ne clignote — le mouvement est un glissement lent des couleurs, figé
 * quand le système demande de réduire les animations.
 */

const FRAGMENT = /* glsl */ `
  uniform vec2 uView;
  uniform float uTime, uReveal, uForce, uOrigine;
  varying vec2 vUv;
  vec3 iri(float t) {
    t = fract(t) * 4.;
    vec3 c0 = vec3(.49, .36, 1.), c1 = vec3(.25, .66, 1.), c2 = vec3(.24, .9, .77), c3 = vec3(1., .36, .66);
    if (t < 1.) return mix(c0, c1, smoothstep(0., 1., t));
    if (t < 2.) return mix(c1, c2, smoothstep(1., 2., t));
    if (t < 3.) return mix(c2, c3, smoothstep(2., 3., t));
    return mix(c3, c0, smoothstep(3., 4., t));
  }
  void main() {
    vec2 px = vec2(vUv.x, 1. - vUv.y) * uView;
    float d = min(min(px.x, uView.x - px.x), min(px.y, uView.y - px.y));
    float a = atan(px.y - uView.y * .5, px.x - uView.x * .5) / 6.28318 + .5;
    float ecart = abs(fract(a - uOrigine + .5) - .5) * 2.;
    float visible = smoothstep(uReveal * 1.15, uReveal * 1.15 - .12, ecart);
    float large = mix(14., 46., uForce);
    float lueur = exp(-d / large) * (.55 + .45 * uForce) + exp(-d / 2.2) * .9;
    gl_FragColor = vec4(iri(a * 2. - uTime * .09), clamp(lueur * visible, 0., 1.));
  }
`;

const lisse = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export class BordVivant {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private u = {
    uView: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uReveal: { value: 0 },
    uForce: { value: 0.35 },
    uOrigine: { value: 0 }
  };
  private force = 0.35;
  private cible = 0.35;
  private vitesse = 0.5;
  private horloge = 0;
  private reveal = { de: 0, vers: 0, t0: 0, duree: 1 };
  private ouvert = false;
  private boucle = 0;
  private dernier = 0;
  private reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    const quad = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({
        uniforms: this.u,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
        fragmentShader: FRAGMENT
      })
    );
    quad.frustumCulled = false;
    this.scene.add(quad);
    // Compilé d'avance : le faire au premier clic coûterait une demi-seconde.
    this.renderer.compile(this.scene, this.camera);
  }

  redimensionner() {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.u.uView.value.set(innerWidth, innerHeight);
  }

  /** `x`, `y` : le point d'où part le halo, en pixels de la fenêtre. */
  ouvrir(x: number, y: number) {
    this.redimensionner();
    this.u.uOrigine.value = Math.atan2(y - innerHeight / 2, x - innerWidth / 2) / (Math.PI * 2) + 0.5;
    this.ouvert = true;
    this.cible = 0.35;
    this.animer(1, 1100);
  }

  fermer() {
    this.ouvert = false;
    this.cible = 0.35;
    this.animer(0, 700);
  }

  reflechir(oui: boolean) {
    this.cible = oui ? 1 : 0.35;
  }

  detruire() {
    cancelAnimationFrame(this.boucle);
    this.renderer.dispose();
  }

  private animer(vers: number, duree: number) {
    this.reveal = { de: this.u.uReveal.value, vers, t0: performance.now(), duree: this.reduit ? 1 : duree };
    if (!this.boucle) {
      this.dernier = performance.now();
      this.boucle = requestAnimationFrame(this.image);
    }
  }

  private image = (now: number) => {
    const dt = Math.min(0.05, (now - this.dernier) / 1000);
    this.dernier = now;
    const r = this.reveal;
    const k = Math.min(1, (now - r.t0) / r.duree);
    this.u.uReveal.value = r.de + (r.vers - r.de) * lisse(k);
    this.force += (this.cible - this.force) * Math.min(1, dt * 2.5);
    this.vitesse += ((this.cible > 0.5 ? 2.2 : 0.6) - this.vitesse) * Math.min(1, dt * 2);
    if (!this.reduit) this.horloge += dt * this.vitesse;
    this.u.uForce.value = this.force;
    this.u.uTime.value = this.horloge;
    this.renderer.render(this.scene, this.camera);
    // Fermé et replié : on cesse de dessiner, la carte graphique se repose.
    if (!this.ouvert && k >= 1) {
      this.renderer.clear();
      this.boucle = 0;
      return;
    }
    this.boucle = requestAnimationFrame(this.image);
  };
}
