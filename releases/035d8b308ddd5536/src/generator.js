import { CONFIG as C, clamp, seededRandom } from './config.js';
import { difficultyAtHeight, routeTypesFor } from './difficulty.js';
import { ordinaryJumpLimits } from './reachability.js';
export class Generator {
  constructor(seed) {
    this.random = seededRandom(seed); this.id = 0; this.row = 0;
    this.y = C.generation.startY; this.x = C.width / 2;
    this.lastBonusRow = 0; this.lastBonusY = -Infinity;
    this.routeBag = []; this.bagStage = -1; this.bagId = 0;
    this.lastRouteType = 'fixed'; this.previousRoute = null;
  }
  platform(x, y, type = 'fixed', extra = {}) {
    const { time = 0, ...properties } = extra;
    const b = { id: ++this.id, x, y, prevX: x, prevY: y, baseX: x, baseY: y, width: C.generation.width, type, broken: false, phase: this.random() * Math.PI * 2, frequency: .8 + this.random() * .5, amplitude: type === 'vertical' ? C.generation.amplitudeY : C.generation.amplitudeX, item: null, springAt: -10, ...properties };
    if (type === 'horizontal') b.x += Math.sin(time * b.frequency + b.phase) * b.amplitude;
    if (type === 'vertical') b.y += Math.sin(time * b.frequency + b.phase) * b.amplitude;
    b.prevX = b.x; b.prevY = b.y;
    return b;
  }
  initial() {
    this.previousRoute = this.platform(this.x, this.y, 'fixed', { width: C.generation.startWidth, route: true, row: 0 });
    return this.previousRoute;
  }
  routeType(introductory, profile) {
    if (introductory) return 'fixed';
    if (!this.routeBag.length || this.bagStage !== profile.stage) {
      this.routeBag = routeTypesFor(profile); this.bagStage = profile.stage; this.bagId++;
    }
    // The permanent route never depends on a disposable platform. Keep the
    // remaining bag schedulable so full-range movers do not repeat their axis.
    const choices = this.routeBag.map((type, index) => ({ type, index }))
      .filter(({ type, index }) => {
        // Long movement ranges need a different type between moving platforms
        // of the same axis, so two opposing sweeps cannot close the route.
        if (type === this.lastRouteType) return false;
        const rest = this.routeBag.filter((_, i) => i !== index);
        return ['fixed', 'vertical', 'horizontal'].every(t => {
          const count = rest.filter(v => v === t).length;
          return count <= rest.length - count + Number(type !== t);
        });
      });
    const choice = choices[Math.floor(this.random() * choices.length)];
    this.lastRouteType = this.routeBag.splice(choice.index, 1)[0];
    return this.lastRouteType;
  }
  generateUntil(top, platforms, { allowItems = true, time = 0 } = {}) {
    while (this.y < top) {
      const spec = C.generation, introductory = this.row < spec.safeRows;
      const profile = difficultyAtHeight((this.y - spec.startY) / 10);
      const type = this.routeType(introductory, profile);
      const previous = this.previousRoute;
      const moveX = type === 'horizontal' ? profile.amplitudeX : 0;
      const moveY = type === 'vertical' ? profile.amplitudeY : 0;
      const horizontalEnvelope = moveX + (previous?.type === 'horizontal' ? previous.amplitude : 0);
      const verticalEnvelope = moveY + (previous?.type === 'vertical' ? previous.amplitude : 0);
      const allowedGap = ordinaryJumpLimits(0).maximumRise - verticalEnvelope;
      const gapFloor = introductory ? spec.introGapMin : Math.min(allowedGap - 8, profile.gapMin);
      const gapCeiling = Math.min(allowedGap, introductory ? spec.introGapMax : profile.gapMax);
      const gap = gapFloor + this.random() * (gapCeiling - gapFloor);
      // Reachability includes both platforms' worst-case movement, not just their centers.
      const reach = ordinaryJumpLimits(gap + verticalEnvelope).horizontalReach - horizontalEnvelope;
      const shiftFloor = Math.min(reach, introductory ? profile.shiftMin * .8 : profile.shiftMin);
      const distance = shiftFloor + this.random() * (reach - shiftFloor);
      let direction = this.random() < .5 ? -1 : 1;
      const width = profile.width;
      // Every base position also leaves room for the next horizontal platform.
      // Otherwise a fixed brick at the edge can be too far from its full sweep.
      const margin = width / 2 + profile.amplitudeX + 10;
      // Reflect instead of clamping: clamping made consecutive platforms stack at an edge.
      if (this.x + direction * distance < margin || this.x + direction * distance > C.width - margin) direction *= -1;
      this.x = clamp(this.x + direction * distance, margin, C.width - margin);
      this.y += gap; this.row++;
      const frequency = profile.frequency * (.92 + this.random() * .16);
      const route = this.platform(this.x, this.y, type, { route: true, width, row: this.row, amplitude: moveX || moveY, frequency, difficulty: profile.stage, bag: this.bagId, time });
      platforms.push(route); this.previousRoute = route;
      if (this.row > 3) this.addItem(route, allowItems);
      // Fragile shortcuts sit between two already reachable permanent steps.
      // Destroying every shortcut leaves the full main route intact.
      if (this.row > spec.safeRows && this.row - this.lastBonusRow >= spec.bonusMinRows && this.random() < profile.bonusChance) {
        const bonusWidth = Math.max(46, width - 14);
        // Keep its fixed top outside either neighbour's complete vertical sweep.
        const shortcutBottom = previous.baseY + (previous.type === 'vertical' ? previous.amplitude : 0) + 22;
        const shortcutTop = route.baseY - moveY - 22;
        const by = clamp(previous.baseY + gap * .55, shortcutBottom, shortcutTop);
        const reachFrom = this.shortcutReach(by - previous.baseY, previous);
        const reachTo = this.shortcutReach(route.baseY - by, route);
        const left = Math.max(bonusWidth / 2 + 10, previous.baseX - reachFrom, route.baseX - reachTo);
        const right = Math.min(C.width - bonusWidth / 2 - 10, previous.baseX + reachFrom, route.baseX + reachTo);
        if (shortcutBottom <= shortcutTop && left <= right && by - this.lastBonusY >= spec.bonusMinHeight) {
          const side = this.x >= previous.baseX ? 1 : -1;
          const bx = clamp((this.x + previous.baseX) / 2 + side * 76, left, right);
          const b = this.platform(bx, by, 'fragile', { width: bonusWidth, amplitude: 0, row: this.row, difficulty: profile.stage, shortcutFrom: previous.id, shortcutTo: route.id, time });
          this.lastBonusRow = this.row; this.lastBonusY = by; platforms.push(b);
        }
      }
    }
  }
  shortcutReach(gap, permanent) {
    const dy = gap + (permanent.type === 'vertical' ? permanent.amplitude : 0);
    return ordinaryJumpLimits(dy).horizontalReach - (permanent.type === 'horizontal' ? permanent.amplitude : 0);
  }
  addItem(b, allowItems = true) {
    const r = this.random(); let sum = 0;
    // Consume the same random draw even when blocked so platform geometry is unchanged.
    if (!allowItems) return;
    for (const type of ['rocket', 'hat', 'spring']) { sum += C.items[type].chance; if (r < sum) { b.item = { type }; return; } }
  }
}
