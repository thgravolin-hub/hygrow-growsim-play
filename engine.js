/* ============================================================================
 * HyGrow Grow-Tent Simulator - deterministic simulation engine (no DOM, no deps)
 * ----------------------------------------------------------------------------
 * Exposes window.CROP_DATA and window.Sim = {create,tick,act,readings,score,
 * stageInfo,defaultSetup,ACTIONS,ecForMl,mlForEc,serialize,deserialize,
 * attachClimate,detachClimate,diagnose}.
 *
 * MODEL SUMMARY (1 tick = 1 in-game hour)
 *  Climate  : Perth monthly max/min/dew-point -> hourly outdoor T and vapour
 *             pressure (+ seeded daily weather noise and heatwaves). Room air
 *             = 50% outdoor + 50% 22C. Tent air = room + (light heat - latent
 *             cooling) / (ventilation + wall loss); relaxes 55%/h to that.
 *             The humidity appliance's latent heat counts too (+196 W dehumidifying, -116 W humidifying).
 *  Humidity : tent vapour pressure = room air + (transpiration + appliance) / airflow.
 *             Transpiration is capped by the light energy that can evaporate water (etCapGh).
 *             VPD = es(T)*(1-RH) with Tetens es = 0.6108*exp(17.27T/(T+237.3)).
 *  Light    : PPFD = watts*dim*umol/J / area ; DLI accumulates on lit hours.
 *  Water    : uptake = stage L/day (interpolated by progress) * plants, split
 *             lit/dark, scaled by VPD and temperature. Reservoir falls by it.
 *  Salts    : nutrient salts (nutL, EC*L) are removed at ratio r<1 of water
 *             uptake => EC rises as the tank shrinks (concentration effect).
 *             inertL = tap-water/unused salts that only a tank change removes.
 *  pH       : drifts up 0.15/day (hydro) or 0.05/day (coco), faster when plants
 *             drink more.
 *  Root zone: solution T lags air (4%/h). DO = saturation(T)*efficiency - load.
 *  Plant    : thermal time (base 10C) drives stage progress. Once per day:
 *             growth = Gmax(stage) * fDLI * mean(min(fT,fEC,fPH,fVPD,fW,fO2))
 *             * problemMultiplier. Health eases toward 100*minFactor*problems.
 *  FACTOR SHAPE (all f): f = 1 inside the tolerant "growth band"; outside it
 *             f = 2^-((d/tol)^2) where d = distance outside the band, so f is
 *             0.5 one tolerance away and ~0.06 two tolerances away.
 * ========================================================================== */
(function (w) {
'use strict';

// ---------------------------------------------------------------------------
// Crop data (from crops.json; days compressed to game days; collapsed bands
// like pH [5.8,5.8] widened to +-0.2 / temps +-1 / ppfd +-50 / dli +-2).
// st(days, ec, ph, tDay, tNight, rootT, rh, vpd, ppfd, dli, photoperiod,
//    uptakeLPerDay, gmax gDM/plant/day, r nutrient:water uptake ratio)
// ---------------------------------------------------------------------------
function st(name, days, ec, ph, tD, tN, rt, rh, vpd, ppfd, dli, pp, up, gmax, r) {
  return { name: name, days: days, ec: ec, ph: ph, tempDay: tD, tempNight: tN, rootTemp: rt, rh: rh,
    vpd: vpd, ppfd: ppfd, dli: dli, photoperiod: pp, uptake: up, gmax: gmax, r: r };
}
// NOTE: RH / VPD targets are ESTIMATES (industry-typical greenhouse values, not from crops.json):
//  tomato & capsicum: propagation 70-85% / 0.4-0.8 kPa; vegetative 60-75% / 0.8-1.1; flowering+fruiting 55-70% / 1.0-1.3.
//  strawberry: propagation 65-80% / 0.5-0.9; later stages 60-75% / 0.8-1.2.
// ===========================================================================
// SOURCES for the lettuce / basil / cucumber / capsicum / chilli entries (all pages were opened 2026-10-29).
//  [S1] HydroExperts AU, "Nominal EC and pH values for hydroponic crops" (hydroexperts.com.au/buying/resource-library/...):
//       Lettuce head EC 0.6-1.4 pH 6.0-6.5; Basil EC 1.0-1.4 pH 5.5-6.5; Cucumber EC 1.6-2.4 pH 5.5-6.0; Capsicum EC 2.0-2.7 pH 6.0-6.5; chilli not listed.
//  [S2] Oklahoma State Univ. Extension, "Electrical Conductivity and pH Guide for Hydroponics": Lettuce 1.2-1.8 / 6.0-7.0; Basil 1.0-1.6 / 5.5-6.0;
//       Cucumber 1.7-2.0 / 5.0-5.5; Pepper 0.8-1.8 / 5.5-6.0.
//  [S3] Cornell CEA / Greenhouse Product News Oct 2016 "Leafy greens": lettuce 75/66F (24/19C), RH 50-70%, seedling DLI 22 then 17 mol/m2/d (13-14 with poor airflow),
//       EC ~1.5, pH 5.5-6.0, head lettuce ~35 d from seed, heads 5-6 oz; tipburn = inadequate Ca to the growing point, worse with fast growth (high DLI) and poor airflow.
//  [S4] Univ. Kentucky CCD-CP-63 "Hydroponic lettuce": day max 24C, night max 18C, RH 50-70% (Botrytis >85%), EC 1.5, pH 5.5-6.0, DLI 12-17, harvest 21-35 d after
//       transplant, 100-210 g/head, tipburn = Ca deficiency in rapidly growing tissue (excess light/heat, poor airflow 0.3-1 m/s), bolting from prolonged heat or large temp swings.
//  [S5] Mississippi State Ext. P2936 basil downy mildew: infects 5-30C; spore formation ~nil at 85% RH, peaks 97-100%; 6 h leaf wetness = minimal, 12 h = severe; air >25C reduces severity.
//  [S6] HortiDaily "Preventing chilling injury in basil": basil chills below 12C (54F).
//  [S7] Frontiers Plant Sci. 2023 basil postharvest review: indoor basil baseline 25C, 150 umol/m2/s, 31-day growth cycle.
//  [S8] UF/IFAS EDIS, greenhouse Beit Alpha cucumber: EC 1.5-2.5 dS/m, pH 5.5-6.5, 56-77 marketable mini/Beit Alpha fruit per plant over 22-27 harvests, powdery mildew common.
//  [S9] Gruda, "Crop technologies: Cucumber": air 22-24C then 20-22C to first harvest, fruit shorter <18C, growth stops <13-15C, root zone min 19C (22-23C preferred),
//       EC ~2 rising to 2.5 dS/m, first harvest 30-45 d after transplant, 2.2-2.5 plants/m2, misshapen fruit from overload, delayed picking, low light, temp/RH swings, thrips, poor pollination.
//  [S10] Starke Ayres Cucumber Production Guideline 2019: growth optimum 25-30C, nights not below 18C.
//  [S11] cucurbit.info "Influence of temperature on powdery mildew in cucumber": mildew developed at 15-21C, stayed away at 21-27C.
//  [S12] Carey & Deuter (DAF Qld) capsicum critical temperature thresholds: vegetative optimum 20-25C; flowering night min 17-21C / day max 28C; flower abscission high at 32-38C day,
//       and above 21C night; <18C mean temp gives malformed fruit; pollen fertility drops <15C and >32C; yield falls >32C; maturity 65-80 d after transplant, harvested in 3-4 picks over 6-8 weeks.
//  [S13] HortAmericas "Nutrient recipe for hydroponic greenhouse bell peppers": EC 2.2 for first 6 weeks rising to 2.5; blossom end rot = most common problem, water stress disrupting Ca movement.
//  [S14] Rev. Mex. Cienc. Agric. 11(2) 2020 (INIFAP), hydroponic habanero: first harvest 103 d after transplant, six cuts over 49 d, best 616.9 g/plant (1054 g/plant cited elsewhere).
//  NOT FOUND / ESTIMATES (marked "est." in comments): RH and VPD targets for every new crop; root temps for basil/chilli; water use per plant per day (all new crops);
//  basil DLI/photoperiod/yield; chilli EC/pH (HydroExperts does not list chilli; pass 8b: EC now 0.6-1.2 / 1.2-1.8 / 1.8-2.4 / 1.8-2.4, see the chilli entry); cucumber DLI; all game-day compression factors.
//  Basil/cucumber/lettuce Johnny's Seeds, Rutgers and Cornell handbook PDFs could not be extracted (page text missing / blocked), so nothing is cited from them.
//  Per-crop fields: plantsPerM2, gf (kg harvestable/plant/day at full growth), fruitG (g per fruit/head, only used for counts), yieldTarget (kg/plant for 100% yield score),
//  fe (iron lockout pH), baseT (thermal-time base C), heatT/coldT/coldW (flower-drop / cold-stall thresholds, air C / solution C), leafK (biomass at which leaf area is 63% of max),
//  harvest ('multi' fruit picks | 'cut' cut-and-come-again | 'once' crop ends), fruitStage (first stage that makes harvestable mass), ripeDays (delay before mass is pickable),
//  p (which problem types apply), leafy (no fruit; fruitKg means harvestable leaf mass), noun (word used in messages).
// ===========================================================================
const P_FRUIT = { ber: 1, crack: 1, heat: 1 };
const CROP_DATA = {
  tomato: { id: 'tomato', name: 'Tomato (cherry)', plantsPerM2: 1.4, gf: 0.115, fruitG: 25, yieldTarget: 4.0, p: Object.assign({ curl: 1 }, P_FRUIT),
    fe: 6.3, // iron lockout pH
    stages: [
      st('propagation', 7,  [0.6, 1.5], [5.6, 6.0], [24, 26], [20, 25], [18, 21], [70, 85], [0.4, 0.8], [150, 250], [11, 15], 18, [0, 0.1],  0.4, 0.5),
      st('vegetative',  21, [1.8, 2.5], [5.6, 6.0], [19, 24], [19, 21], [18, 21], [60, 75], [0.8, 1.1], [280, 400], [14, 20], 14, [0.2, 0.5], 5, 0.7),
      st('flowering',   14, [2.7, 3.5], [5.6, 6.0], [20, 26], [17, 19], [18, 21], [55, 70], [1.0, 1.3], [280, 400], [14, 20], 14, [0.5, 1.5], 7, 0.65),
      st('fruiting',    48, [2.7, 4.0], [5.8, 6.2], [20, 22], [17, 19], [18, 21], [55, 70], [1.0, 1.3], [350, 500], [22, 30], 14, [1.5, 3.0], 7, 0.6)] },
  // Sweet capsicum (bell). Bands from crops.json (the old shared capsicum/chilli entry); EC 2.0-2.7 / pH 6.0-6.5 agree with [S1][S13]; temps with [S12].
  // Pass 8b: vegetative EC floor 1.8 -> 1.6 (still inside [S2] pepper 0.8-1.8 up to [S1] 2.0-2.7), so the day-8 step from the seedling band is a smaller jump; flowering and fruiting stay at the cited 2.0-2.7.
  capsicum: { id: 'capsicum', name: 'Sweet capsicum', plantsPerM2: 3, gf: 0.034, fruitG: 150, yieldTarget: 1.3, fe: 6.5, p: Object.assign({ captip: 1, smallfruit: 1 }, P_FRUIT),
    heatT: 30, coldT: 15, // [S12]: flower drop climbs above ~32C day; tent air is cooler than leaf/flower temp so flag from 30 (est.)
    stages: [
      st('propagation', 7,  [0.8, 1.2], [5.8, 6.2], [24, 28], [20, 22], [18, 21], [70, 85], [0.4, 0.8], [150, 250], [8, 12],  16, [0, 0.05],  0.3, 0.5),
      st('vegetative',  21, [1.6, 2.2], [5.8, 6.2], [24, 28], [19, 21], [18, 21], [60, 75], [0.8, 1.1], [250, 400], [14, 20], 14, [0.1, 0.4], 4, 0.7),
      st('flowering',   14, [2.0, 2.7], [6.0, 6.5], [22, 28], [18, 21], [18, 21], [55, 70], [1.0, 1.3], [300, 450], [14, 20], 14, [0.3, 0.8], 5, 0.65),
      st('fruiting',    48, [2.0, 2.7], [6.0, 6.5], [22, 28], [18, 21], [18, 21], [55, 70], [1.0, 1.3], [300, 500], [14, 30], 14, [0.5, 1.5], 5, 0.6)] },
  // Chilli (habanero-type). Hotter and slower than sweet capsicum; pH shifted up slightly (est., chilli not in [S1]); 100 game days; many small fruit [S14].
  // Pass 8b EC change (docs/PLAYTEST-DEV-v34.md "Wrong or vague" 1, a Perth coco grower): the old bands were capsicum's shifted UP (1.8-2.2 veg, 2.0-2.8 fruiting) and a day-8 seedling
  // was asked to jump from 1.0 to 2.0 in one tap, which burns a week-old chilli. Now propagation 0.8-1.2 -> 0.6-1.2, vegetative 1.8-2.2 -> 1.2-1.8, flowering and fruiting 2.0-2.8 -> 1.8-2.4
  // (an estimate again: chilli is not in [S1]; the top of the range now sits between [S2] pepper 0.8-1.8 and [S1] capsicum 2.0-2.7, and the old 2.8 was a ceiling, not a target).
  chilli: { id: 'chilli', name: 'Chilli', plantsPerM2: 4, gf: 0.0235, fruitG: 15, yieldTarget: 0.9, fe: 6.5, p: Object.assign({ aphid: 1, thinfruit: 1 }, P_FRUIT), leafK: 80,
    heatT: 33, coldT: 17, coldW: 18, // chillies like it hot: flower drop from ~33C (est. from [S12]); cold stall below 17C air / 18C solution (est.)
    stages: [
      st('propagation', 8,  [0.6, 1.2], [5.8, 6.2], [26, 30], [21, 24], [20, 24], [70, 85], [0.4, 0.8], [150, 250], [8, 12],  16, [0, 0.05],  0.25, 0.5),
      st('vegetative',  24, [1.2, 1.8], [5.8, 6.2], [26, 30], [20, 23], [20, 24], [60, 75], [0.8, 1.2], [300, 450], [16, 22], 14, [0.1, 0.35], 3.5, 0.7),
      st('flowering',   18, [1.8, 2.4], [6.0, 6.5], [26, 30], [20, 23], [20, 24], [55, 70], [1.0, 1.4], [350, 500], [18, 24], 14, [0.25, 0.7], 4.5, 0.65),
      st('fruiting',    50, [1.8, 2.4], [6.0, 6.5], [26, 30], [20, 23], [20, 24], [55, 70], [1.0, 1.4], [350, 550], [20, 30], 14, [0.4, 1.1], 4.5, 0.6)] },
  strawberry: { id: 'strawberry', name: 'Strawberry', plantsPerM2: 6, gf: 0.015, fruitG: 15, yieldTarget: 0.6, fe: 6.3, p: Object.assign({ greymould: 1, runners: 1, smallberry: 1 }, P_FRUIT),
    stages: [
      st('propagation', 5,  [0.8, 1.2], [5.6, 6.0], [20, 23], [17, 19], [16, 20], [65, 80], [0.5, 0.9], [200, 450], [10, 19], 12, [0, 0.05],  0.2, 0.5),
      st('vegetative',  14, [1.4, 1.8], [5.5, 6.0], [22, 24], [17, 19], [16, 20], [60, 75], [0.8, 1.2], [250, 450], [10, 15], 16, [0.05, 0.15], 1.5, 0.7),
      st('flowering',   10, [1.8, 2.0], [5.8, 6.2], [22, 24], [17, 19], [16, 20], [60, 75], [0.8, 1.2], [250, 450], [15, 19], 14, [0.1, 0.3], 2, 0.65),
      st('fruiting',    45, [1.4, 2.0], [6.0, 6.2], [22, 24], [17, 19], [16, 20], [60, 75], [0.8, 1.2], [250, 450], [15, 19], 12, [0.07, 0.8], 2, 0.6)] },
  // Butterhead lettuce, 35 game days. Leafy: no fruit; fruitKg = harvestable head mass. One harvest ends the crop.
  lettuce: { id: 'lettuce', name: 'Butterhead lettuce', plantsPerM2: 12, gf: 0.014, fruitG: 150, yieldTarget: 0.15, fe: 6.3, leafy: true, noun: 'heads', matureMsg: 'The heads are full size. Harvest now, before the warm days make them bolt!',
    harvest: 'once', fruitStage: 2, ripeDays: 0, accrueEnd: true, leafK: 6, baseT: 4, alertPer: 0.1, boltT: 25, // base 4C: lettuce is cool-season (est.)
    p: { tip: 1, bolt: 1, slugbite: 1, rootrot: 1 }, // head 100-210 g [S4], 5-6 oz [S3]; 0.15 kg target; uptake ~3 L per head per crop (est.)
    stages: [
      st('propagation', 5,  [0.5, 0.9], [5.6, 6.2], [20, 24], [16, 19], [18, 21], [65, 80], [0.4, 0.8], [200, 350], [15, 22], 18, [0, 0.02],     0.05, 0.5), // DLI 22 seedlings [S3]
      st('vegetative',  12, [1.0, 1.4], [5.6, 6.2], [20, 24], [16, 18], [18, 21], [50, 70], [0.7, 1.1], [200, 300], [12, 17], 16, [0.03, 0.08],  0.25, 0.7), // EC [S1][S3][S4], DLI 12-17 [S4], RH 50-70 [S3][S4]
      st('heading',     12, [1.2, 1.6], [5.6, 6.2], [20, 24], [16, 18], [18, 21], [50, 70], [0.7, 1.1], [200, 300], [12, 17], 16, [0.08, 0.15], 0.55, 0.65), // day max 24 / night max 18 [S4]
      st('harvest',     6,  [1.2, 1.6], [5.6, 6.2], [20, 24], [16, 18], [18, 21], [50, 70], [0.7, 1.1], [200, 300], [12, 17], 16, [0.12, 0.18], 0.4, 0.6)] },
  // Genovese basil, 45 game days, cut-and-come-again. fruitKg = standing harvestable leaf (cap standCap kg/plant); a cut takes a third and leaves two thirds (cutFrac 0.35).
  basil: { id: 'basil', name: 'Sweet basil (Genovese)', plantsPerM2: 12, gf: 0.02, fruitG: 60, yieldTarget: 0.2, fe: 6.2, leafy: true, noun: 'leaves', matureMsg: 'The basil is going to flower. Cut it all back now!',
    harvest: 'cut', cutFrac: 0.35, standCap: 0.145, cutLeaf: 0.85, cutBio: 0.88, fruitStage: 2, ripeDays: 0, accrueEnd: true, leafK: 10, baseT: 10, alertPer: 0.06, coldT: 13, coldW: 17, coldPen: 0.12, // chilling < 12C [S6]
    p: { dm: 1, fusarium: 1 }, // fe 6.2: basil is iron-chlorosis prone at high pH (pH band [S1][S2]); yield per plant (est.)
    stages: [
      st('propagation', 7,  [0.6, 1.0], [5.6, 6.2], [24, 27], [20, 22], [22, 26], [65, 80], [0.4, 0.8], [150, 250], [8, 12],  16, [0, 0.02],      0.05, 0.5),
      st('vegetative',  12, [1.0, 1.4], [5.6, 6.2], [22, 26], [18, 21], [20, 24], [50, 70], [0.8, 1.2], [250, 400], [14, 20], 16, [0.04, 0.1],   0.35, 0.7), // EC [S1][S2]; 25C baseline [S7]; RH est. kept under 85 for mildew [S5]
      st('cutting',     14, [1.2, 1.6], [5.6, 6.2], [22, 26], [18, 21], [20, 24], [50, 70], [0.8, 1.2], [250, 400], [14, 20], 16, [0.1, 0.22],   0.8, 0.65),
      st('flowering',   12, [1.2, 1.6], [5.6, 6.2], [22, 26], [18, 21], [20, 24], [50, 70], [0.8, 1.2], [250, 400], [14, 20], 16, [0.15, 0.25],  0.8, 0.6)] },
  // Lebanese (Beit Alpha) cucumber, 70 game days, harvested repeatedly. 3 plants in the default tent [S9][S10] ~2.2 plants/m2.
  cucumber: { id: 'cucumber', name: 'Lebanese cucumber', plantsPerM2: 2.2, gf: 0.155, fruitG: 120, yieldTarget: 5.0, fe: 6.3, // 47-77 fruit x ~100 g per plant [S8]
    ripeDays: 5, heatT: 34, hotGrace: 3, coldT: 16, coldW: 17, baseT: 12,
    p: { heat: 1, pm: 1, bit: 1, spidermite: 1, mushyfruit: 1 },
    stages: [
      st('propagation', 7,  [0.8, 1.2], [5.6, 6.0], [24, 28], [20, 22], [20, 24], [70, 85], [0.4, 0.8], [150, 250], [10, 14], 16, [0, 0.1],     0.4, 0.5),
      st('vegetative',  14, [1.6, 2.0], [5.6, 6.0], [22, 27], [18, 21], [20, 24], [65, 80], [0.6, 1.0], [250, 400], [14, 20], 14, [0.3, 0.8],   5, 0.7), // EC [S1][S2][S9]; root min 19C [S9]
      st('flowering',   7,  [1.8, 2.2], [5.6, 6.0], [22, 27], [18, 21], [20, 24], [65, 80], [0.6, 1.0], [250, 450], [16, 24], 14, [0.8, 1.5],   7, 0.65),
      st('fruiting',    42, [2.0, 2.4], [5.6, 6.0], [22, 27], [18, 21], [20, 24], [65, 80], [0.6, 1.0], [300, 500], [18, 26], 14, [1.5, 2.5],   8, 0.6)] }
};
// Suggested divisor for the UI plant size: size = sqrt(readings.plant.leafArea / leafMaxUI) (measured from managed runs, default tent).
const LEAFMAX_UI = { tomato: 1.4, chilli: 4.0, capsicum: 2.6, strawberry: 4.0, lettuce: 10, basil: 11, cucumber: 2.0 };
Object.keys(LEAFMAX_UI).forEach(k => { CROP_DATA[k].leafMaxUI = LEAFMAX_UI[k]; });
// Perth climate by month (Jan..Dec): mean max, mean min, mean dew point (C). Estimated from BoM normals.
CROP_DATA.climate = {
  max: [31.5, 32, 29.5, 26, 22, 19.5, 18.5, 19, 20.5, 23, 26.5, 29],
  min: [18, 18.5, 17, 14, 11, 9, 8, 8, 9.5, 11, 14, 16],
  dew: [12, 13, 12.5, 11.5, 10.5, 9, 8, 7.5, 7.5, 8, 9.5, 11],
  startDoy: { spring: 263, summer: 344, autumn: 69, winter: 161 } };
// Professor's original: A/B dose (ml/L each) -> EC. Chart points (ml,EC): (2,1.8)(2.2,2.0)(2.6,2.0)(3.4,2.4)(2.5,1.8)
// least-squares line EC = 0.8 + 0.47*ml ; below 2 ml/L interpolate from tap water (0.3 mS).
CROP_DATA.nutrients = { professors: { waterEC: 0.3, slope: 0.47, icpt: 0.8, extraMlPerL: 4.5, costPerMl: 0.035 } };
w.CROP_DATA = CROP_DATA;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const CLIMATE = { roomSwing: 0.5, airRelax: 0.35, vapRelax: 0.4 }; // v59 (play-test #13 #8): room buffering and the tent's thermal / vapour mass (see step())
const ROOM_EA = 0.35; // kPa: indoor air is a little damper than outdoors (people, washing, closed house) - assumption
const HUM_GH = 230, HUM_W = 40, FAN_W_PER_M3H = 0.1, FAN_LEVELS = [0, 150, 300, 450]; // assumptions: 230 g/h appliance, 40 W, 0.1 W per m3/h of fan
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const es = T => 0.6108 * Math.exp(17.27 * T / (T + 237.3)); // Tetens, kPa
const r2 = (x, n) => { const p = Math.pow(10, n === undefined ? 2 : n); return Math.round(x * p) / p; };
// f = 1 inside [lo,hi]; 2^-((d/tol)^2) outside (0.5 at one tolerance away).
function band(x, lo, hi, tolLo, tolHi) {
  if (x >= lo && x <= hi) return 1;
  const d = x < lo ? (lo - x) / tolLo : (x - hi) / tolHi;
  return Math.pow(2, -d * d);
}
const th = (x, a, b, c) => x >= c ? 3 : x >= b ? 2 : x >= a ? 1 : 0;
// mulberry32 seeded PRNG stored in state (reproducible, no Math.random)
function rand(S) {
  S.rng = (S.rng + 0x6D2B79F5) >>> 0;
  let t = S.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const gauss = S => (rand(S) + rand(S) + rand(S) - 1.5) * 2; // ~N(0,1)

function ecForMl(ml) { const n = CROP_DATA.nutrients.professors; return ml <= 2 ? n.waterEC + ml * ((n.icpt + n.slope * 2 - n.waterEC) / 2) : n.icpt + n.slope * ml; }
function mlForEc(ec) { const n = CROP_DATA.nutrients.professors; const e2 = n.icpt + n.slope * 2; return ec <= e2 ? Math.max(0, (ec - n.waterEC) / ((e2 - n.waterEC) / 2)) : (ec - n.icpt) / n.slope; }
const concPerL = ml => 2 * ml + CROP_DATA.nutrients.professors.extraMlPerL; // total concentrate ml per L of solution

function ev(type, id, title, text, severity, fix, hint) {
  return { type: type, id: id, title: title, text: text, severity: severity || 0, fixActions: fix || [], productHint: hint || '' };
}


// ---------------------------------------------------------------------------
// GROW METHODS: where (tent | veranda | outdoors) x how (soil | coco | hydro | tower).
// Everything below is dormant for the default tent + hydro-tub grow: S.pot, S.out and S.slots are only set by initMethod().
// The model, numbers and sources are written up in docs/METHODS.md ([M#] tags there and in the comments here).
// ---------------------------------------------------------------------------
const METHODS = {
  where: {
    tent: { label: 'Indoor tent', blurb: 'Lights, fan and full control. Costs power.' },
    veranda: { label: 'Veranda pots', blurb: 'Half the sun, kept out of most rain and wind.' },
    outdoors: { label: 'Garden bed', blurb: 'Full sun, rain and cold winter nights.' }
  },
  how: {
    soil: { label: 'Soil, hand watered', blurb: 'Forgiving. Water when it feels dry, feed weekly.' },
    coco: { label: 'Coco, hand or drip fed', blurb: 'Fast draining. Feed by hand or on a timer.' },
    hydro: { label: 'Hydro tub (recirculating)', blurb: 'One tank, tight control, daily checks.' },
    tower: { label: 'Hydro tower, many plants', blurb: 'Vertical hydro. Stagger your planting.' }
  },
  combos: [['tent', 'soil'], ['tent', 'coco'], ['tent', 'hydro'], ['tent', 'tower'], ['veranda', 'soil'], ['veranda', 'coco'], ['veranda', 'tower'], ['outdoors', 'soil'], ['outdoors', 'coco'], ['outdoors', 'tower']]
};
const HOW_MEDIUM = { soil: 'soil', coco: 'coco', hydro: 'hydro', tower: 'hydro' };
// [M1] litres of medium per plant in a pot / bag (assumption: 20 L tomato or cucumber pot, small pots for leafy crops and berries); a garden bed is 1.2 x 1 m x 0.3 deep, 6 plants.
const POT_L = { tomato: 20, chilli: 12, capsicum: 15, strawberry: 5, lettuce: 2.5, basil: 3, cucumber: 20 };
const AWC = { soil: 0.25, coco: 0.35 }; // [M2] plant-available water per litre of medium (loam / potting mix 0.15-0.25, coir 0.3-0.4)
const BED = { area: 1.2, depth: 0.3, plants: 6 }, VERANDA_POTS = 3, POT_DEPTH = 0.28;
const SOIL_TOP = 0.8;                        // [M-x] v45 top of the soil moisture band (45 to 80 %): a soil Feed or Water stops here
const FC = 0.85;                              // [M3] moisture right after a watering has drained = "field capacity" in the game
const POT_DRAIN = { soil: 0.08, coco: 0.2 }; // fraction of the excess above FC that drains each hour (coir is open and free draining)
const SOIL_DRAW = 0.3, SOIL_DOSE = 1.2;      // [M4] soil's clay and organic matter buffer feed: plants draw 30 % of the solution rate; a feed drench adds (mix EC - tap EC) x 1.2 x (a mature plant's peak daily drink) per plant
const TOWER_DEFAULT_SLOTS = 8;
const CHILL_MAX = 0.45, CHILL_FULL = 400; // [M15] slow outdoor chill: the growth multiplier loses up to 45 % once 400 degree-hours are banked
const HOT_GRACE = 1;
const OUT_START_HOUR = 9, OUT_START_MOIST = 0.65; // [M16] an outdoor grow starts mid-morning with the pot or bed watered in but inside the moisture band, not brimming
const GRACE_H = 24; // [M16] outdoors the air-temperature tile and the humidity tile give a full day of 'warn' before they go red
const CHILL_GRACE = 5; // [M15] outdoors the cold edge of the temperature factor sits 5 C lower than the tent edge: a chilly night is mild stress at first

function normMethod(u) {
  const where = METHODS.where[u.where] ? u.where : 'tent';
  const explicit = u.how === undefined || !METHODS.how[u.how];
  let how = explicit ? 'hydro' : u.how;
  if (how === 'hydro' && where !== 'tent') how = 'tower'; // the single hydro tub is tent only
  return { where: where, how: how, legacyMedium: explicit };
}
/* [M-TOW] tower balance (v44): a vine does not fit 8 slots, so tomato and cucumber top out at 4 and the other fruit crops at the tub's plant count; a leafy slot is a net cup with two seedlings (x2) */
const TOWER_MAX = { tomato: 4, cucumber: 4, capsicum: 4, chilli: 6, strawberry: 9 }, TOWER_LEAFY_X = 2;
function towerX(S) { return S.slots && CROP_DATA[S.cropId].leafy ? TOWER_LEAFY_X : 1; } // [M-TOW]
function slotCount(u, crop) { return clamp(Math.round(+u.slots || TOWER_DEFAULT_SLOTS), 1, TOWER_MAX[crop] || 24); } // [M-TOW]
function nplantsFor(m, C, su, u) {
  if (m.how === 'tower') return Math.max(1, Math.min(slotCount(u, C.id), u.planted === undefined ? slotCount(u, C.id) : Math.max(0, Math.round(+u.planted) || 0)));
  if (m.where === 'veranda') return VERANDA_POTS;
  if (m.where === 'outdoors') return BED.plants;
  return Math.max(1, Math.round(su.tent.area_m2 * C.plantsPerM2));
}

function potDen(S) { return S.method.how === 'soil' ? S.cap : Math.max(S.resL, 0.5 * S.cap); }
function pestPressure(S) { return S.out ? (S.method.where === 'veranda' ? 1.4 : 2) : 1; }
function coldLim(S, C, v, add) { return S.out ? Math.min(v, (C.baseT === undefined ? 10 : C.baseT) + add) : v; } // outdoors a crop only counts as cold close to its base temperature [M12]
function inertRatio(S) { return S.pot ? S.inertL / potDen(S) : S.inertL / Math.max(S.resL, 0.5); }

// ---- the sun and the weather outside [M5..M9] ----
const LAT = -32.0 * Math.PI / 180, SOLAR_NOON = 12.27; // Byford / Perth, 115.9E in UTC+8 => solar noon about 12:16 [M5]
function sunDecl(doy) { return 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + doy) / 365); }
// Clear-sky PAR (umol/m2/s) in the middle of clock hour h: Haurwitz 1976 clear-sky global irradiance GHI = 1098 cos z exp(-0.057/cos z) W/m2,
// PAR = 45 % of global x 4.57 umol/J = 2.06 umol per J of global. Clear noon: midsummer ~2000, midwinter ~1150 umol.
function sunPpfd(doy, h) {
  const d = sunDecl(doy), om = (h + 0.5 - SOLAR_NOON) * 15 * Math.PI / 180;
  const cz = Math.sin(LAT) * Math.sin(d) + Math.cos(LAT) * Math.cos(d) * Math.cos(om);
  if (cz <= 0.02) return 0;
  return 1098 * cz * Math.exp(-0.057 / cz) * 2.06;
}
function dayLength(doy) { return 24 / Math.PI * Math.acos(clamp(-Math.tan(LAT) * Math.tan(sunDecl(doy)), -1, 1)); }
// [M6] mean days with >= 1 mm and mean monthly rain (mm), Perth region, Jan..Dec. Approximate BoM climate normals (Perth Airport style): winter ~15 wet days a month, summer ~2.
const RAIN_DAYS = [2.4, 2.5, 3.8, 6.7, 11, 14.5, 16.7, 15.1, 12.8, 8.9, 5, 3.2], RAIN_MM = [13, 15, 20, 41, 94, 140, 148, 114, 82, 46, 22, 14];
const MDAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
// One new day of weather outside. Wet-day persistence a = 0.3 keeps the long-run wet fraction at exactly p. All draws come from the seeded S.rng.
function outsideDay(S, doy) {
  const wx = S.wx, mi = Math.floor((((doy - 1) % 365) / 30.4375)) % 12, p = RAIN_DAYS[mi] / MDAYS[mi], a = 0.3;
  wx.wet = rand(S) < (wx.wet ? p + (1 - p) * a : p * (1 - a));
  wx.rainMm = wx.wet ? clamp((RAIN_MM[mi] / RAIN_DAYS[mi]) * -Math.log(1 - 0.999 * rand(S)), 1, 60) : 0; // exponential, mean = month total / wet days
  wx.rainStart = Math.floor(rand(S) * 18); wx.rainLen = 3 + Math.floor(rand(S) * 9);
  wx.cf = wx.wet ? 0.2 + 0.25 * rand(S) : 1 - 0.4 * Math.pow(rand(S), 2); // cloud factor on the clear-sky sun: 0.2-0.45 on rain days, mostly 0.85-1 otherwise
  wx.wind = clamp((mi === 11 || mi < 2 ? 18 : 13) + 5 * gauss(S) + (wx.wet ? 5 : 0), 3, 60); // mean km/h: Perth's summer sea breeze is stronger [M7]
  S.dayLen = dayLength(doy);
}
// The hour outside as this grow sees it (bed or pots): shade cloth takes 30 % of the light and 2.5 C off the air while the sun is out [M10], a veranda adds 1.5 C of shelter and 50 % of the sun hours [M8].
// Cover [M15]: a garden bed under frost cloth is 3 C warmer at night and takes 15 % less light by day; veranda pots brought inside are 6 C warmer at night (the indoor floor) and get no sun while they are in.
function outsideHour(S, doy) {
  const o = outdoorNow(S, true), wx = S.wx, h = S.hour, ver = S.method.where === 'veranda';
  const raw = sunPpfd(doy, h) * (wx.cf === undefined ? 1 : wx.cf), day = raw * (ver ? 0.5 : 1) > 5, cov = !!S.cover;
  const T = o.T + (ver ? 1.5 : 0) - (S.shade && day ? 2.5 : 0) + (cov && !day ? (ver ? 6 : 3) : 0);
  const rain = wx.rainMm > 0 && ((h - wx.rainStart + 24) % 24) < wx.rainLen ? wx.rainMm / wx.rainLen : 0;
  const ea = rain > 0 ? es(T) * 0.97 : Math.min(o.ea, es(T) * 0.92); // night air is never quite saturated (the monthly dew point is a daily mean)
  const sun = raw * (ver ? 0.5 : 1) * (S.shade ? 0.7 : 1) * (cov ? (ver ? 0 : 0.85) : 1);
  const wind = (wx.wind || 0) * (0.55 + 0.9 * Math.max(0, Math.sin(Math.PI * (h - 8) / 12))) * (ver ? 0.5 : 1);
  return { T: T, ea: ea, sun: sun, rain: rain, wind: wind, day: day };
}

// ---- pots (soil, coco): the root zone is one store of plant-available water S.resL (litres) with capacity S.cap; moisture = resL / cap [M3] ----
// Water in, with the salt it carries. Anything above keep x cap drains out and takes salt with it (all of it for coco, half for soil).
function potAdd(S, litres, o) {
  if (!(litres > 0)) return 0;
  const np = CROP_DATA.nutrients.professors, tap = o.tapEC !== undefined ? o.tapEC : ((S.setup.mods && S.setup.mods.tapEC) || np.waterEC);
  const W0 = S.resL; let Wn = W0 + litres;
  S.nutL += Math.max(0, (o.ec === undefined ? tap : o.ec) - np.waterEC) * litres;
  S.inertL += tap * litres;
  if (o.ph !== undefined && S.method.how === 'coco') S.ph = clamp((S.ph * W0 + o.ph * litres) / Wn, 3.5, 9);
  const keep = (o.keep === undefined ? FC : o.keep) * S.cap; let ex = 0;
  if (Wn > keep) {
    ex = Wn - keep; const lf = 1 - (ex / Wn) * (S.method.how === 'coco' ? 1 : 0.5);
    S.nutL *= lf; S.inertL *= lf; Wn = keep;
    if (o.count) S.runoffL += ex; else S.drainL = (S.drainL || 0) + ex;
  }
  S.resL = Wn; return ex;
}
function useConcS(S, ml) { const np = CROP_DATA.nutrients.professors; S.nutrientMl += ml; S.refills = Math.floor(S.nutrientMl / 1000); S.cost += ml * np.costPerMl; }
function mixCostMl(S, litres, ec) { const np = CROP_DATA.nutrients.professors; return concPerL(S.mlPerL) * litres * (ec - np.waterEC) / Math.max(ec, 0.3); }
// What a feed or drip dose is made at: the player's mix, or the middle of this stage's EC band until they set one.
function feedMl(S, p) {
  if (p && p.mlPerL !== undefined && isFinite(+p.mlPerL)) { S.mlPerL = clamp(+p.mlPerL, 0, 12); S.mixSet = true; }
  else if (!S.mixSet) { const e = stageOf(S).ec; S.mlPerL = mlForEc((e[0] + e[1]) / 2); }
  return S.mlPerL;
}
// The hourly pot book-keeping that follows the plants' drink: surface evaporation, rain, drip timer, drainage [M3][M9].
function potHour(S, lit, ppfd, o) {
  const hw = S.method.how, wind = o ? o.wind : 0;
  // bare soil loses ~1.5 mm a day in still shaded air; more in sun, dry air and wind; a full canopy shades it
  const cover = Math.min(1, S.leaf / 0.9), vp = clamp(0.5 + 0.7 * S.vpd, 0.5, 1.7);
  S.resL = Math.max(0, S.resL - S.potA * 1.5 * (0.3 + 0.7 * Math.min(1, ppfd / 1200)) * vp * (1 + 0.01 * wind) * (1 - 0.8 * cover) / 24);
  if (o && o.rain > 0) { // rain onto the bed, or the fraction that reaches veranda pots (20 %) [M8]
    const reach = S.method.where === 'veranda' ? 0.2 : 1;
    potAdd(S, o.rain * S.potA * reach, { ec: 0, tapEC: 0.03, ph: 5.6, keep: 1 });
  }
  if (S.drip && lit && S.t % 4 === 0 && S.resL < 0.8 * S.cap) { // drip timer: every 4 h of the light period, top the root zone up to 0.8 with feed [M11]
    const ec = ecForMl(feedMl(S)), l = 0.8 * S.cap - S.resL;
    useConcS(S, mixCostMl(S, l, ec)); S.supplyL += l; S.cost += l * 0.0025;
    potAdd(S, l, { ec: ec, ph: 6.2, keep: 0.8 + 1e-9 });
  }
  const m = S.resL / S.cap;
  if (m > FC) { // drainage of the excess; the water takes salt with it (half as much from soil)
    const dr = (m - FC) * S.cap * POT_DRAIN[hw], lf = 1 - (dr / Math.max(S.resL, 0.05)) * (hw === 'coco' ? 1 : 0.5);
    S.resL -= dr; S.nutL *= lf; S.inertL *= lf; S.drainL = (S.drainL || 0) + dr;
  }
}

// ---- tower: one reservoir, many plants, each with its own age [M13] ----
function newSlot(C, day) {
  return { planted: day, stage: 0, gdd: 0, mature: false, matureAnnounced: false, health: 100, bio: 0.3 * (C.leafK || 120) / 120, leaf: 0.01, kg: 0, hist: [], lastCut: -99, cropDone: false, ripeAlert: -99, pest: 0, acc: { sum: 0, w: 0, dli: 0 }, p: 0 };
}
function emptySlot() { return { planted: null, stage: 0, gdd: 0, mature: false, matureAnnounced: false, health: 100, bio: 0, leaf: 0, kg: 0, hist: [], lastCut: -99, cropDone: false, ripeAlert: -99, pest: 0, acc: { sum: 0, w: 0, dli: 0 }, p: 0 }; }
const live = sl => sl.planted !== null && sl.planted !== undefined && !sl.cropDone;
let IN_SLOT = false;
// Run fn with one slot's plant state swapped into S (so the single-plant maths is reused unchanged), then write it back.
const SLOT_KEYS = ['stage', 'gdd', 'mature', 'matureAnnounced', 'health', 'bio', 'leaf', 'hist', 'lastCut', 'cropDone', 'ripeAlert', 'acc'];
function inSlot(S, sl, fn) {
  const keep = {}; SLOT_KEYS.forEach(k => { keep[k] = S[k]; });
  keep.fruitKg = S.fruitKg; keep.nplants = S.nplants; keep.pestLevel = S.pestLevel;
  SLOT_KEYS.forEach(k => { S[k] = sl[k]; }); S.fruitKg = sl.kg; S.nplants = 1; S.pestLevel = sl.pest; IN_SLOT = true;
  try { return fn(); }
  finally {
    SLOT_KEYS.forEach(k => { sl[k] = S[k]; }); sl.kg = S.fruitKg; sl.pest = S.pestLevel; IN_SLOT = false;
    SLOT_KEYS.forEach(k => { S[k] = keep[k]; }); S.fruitKg = keep.fruitKg; S.nplants = keep.nplants; S.pestLevel = keep.pestLevel;
  }
}
function pushUniq(evs, arr) { arr.forEach(e => { if (!evs.some(x => x.id === e.id && x.type === e.type)) evs.push(e); }); }
// Aggregate the slots into the single-plant fields the UI, scoring and shared targets read.
function syncAgg(S) {
  const C = CROP_DATA[S.cropId], sl = S.slots, lv = sl.filter(live);
  sl.forEach(x => { if (x.planted !== null && x.planted !== undefined) { const st = C.stages[x.stage]; x.p = x.mature ? 1 : clamp(x.gdd / (st.days * 10.5), 0, 1); } else x.p = 0; });
  if (lv.length) {
    let lead = lv[0]; lv.forEach(x => { if (x.planted < lead.planted) lead = x; }); // the oldest plant sets the shared targets
    S.stage = lead.stage; S.gdd = lead.gdd; S.matureAnnounced = lead.matureAnnounced;
    S.health = lv.reduce((a, x) => a + x.health, 0) / lv.length;
    S.bio = lv.reduce((a, x) => a + x.bio, 0) / lv.length; S.leaf = lv.reduce((a, x) => a + x.leaf, 0) / lv.length;
    S.nplants = lv.length; S.pestLevel = lv.reduce((a, x) => a + x.pest, 0) / lv.length;
    S.cropDone = false;
  } else S.cropDone = S.harvestedKg > 0 || sl.some(x => x.cropDone);
  S.mature = lv.some(x => x.mature);
  S.lastCut = sl.reduce((a, x) => Math.max(a, x.lastCut), -99);
  S.fruitKg = sl.reduce((a, x) => a + (live(x) ? x.kg : 0), 0);
  S.canopyA = Math.max(0.1, 0.1 * lv.length);
}
function slotRipe(x) { let sum = 0; for (let i = 0; i < x.hist.length; i++) sum += x.hist[i]; return Math.max(0, x.kg - sum); }
function slotInfo(S) {
  if (!S.slots) return [];
  const C = CROP_DATA[S.cropId], total = C.stages.reduce((a, s) => a + s.days, 0);
  return S.slots.map(x => {
    if (x.planted === null || x.planted === undefined) return { planted: null, stageName: null, progress: 0, health: 0, ripeKg: 0, empty: true };
    const st = C.stages[x.stage], p = x.mature ? 1 : clamp(x.gdd / (st.days * 10.5), 0, 1);
    let done = 0; for (let i = 0; i < x.stage; i++) done += C.stages[i].days;
    return { planted: x.planted, stageName: x.mature ? 'mature' : st.name, progress: r2(x.mature ? 1 : (done + p * st.days) / total, 3), health: r2(x.health, 0), ripeKg: r2(slotRipe(x), 3), empty: false };
  });
}
function towerUptake(S) {
  let U = 0;
  S.slots.forEach(x => { if (live(x)) { const st = CROP_DATA[S.cropId].stages[x.stage], sp = x.mature ? 1 : clamp(x.gdd / (st.days * 10.5), 0, 1); U += lerp(st.uptake[0], st.uptake[1], Math.pow(sp, 0.8)); } });
  return U;
}

function initMethod(S, m, u, C) {
  S.method = { where: m.where, how: m.how };
  const out = m.where !== 'tent', ver = m.where === 'veranda', ec0 = 0.8;
  if (out) { S.out = true; S.hour = OUT_START_HOUR; S.shade = !!u.shade; S.cover = false; S.coverDay = 0; S.rainLog = []; for (let i = 0; i < 24; i++) S.rainLog.push(0); S.wx.wet = false; S.dayLen = 12; S.sunNow = 0; }
  if (m.how === 'soil' || m.how === 'coco') {
    const per = POT_L[S.cropId] || 10, bed = m.where === 'outdoors' && m.how === 'soil';
    const cap = bed ? BED.area * BED.depth * 1000 * AWC.soil : S.nplants * per * AWC[m.how];
    S.pot = true; S.cap = cap; S.resL = (out ? OUT_START_MOIST : FC) * cap; S.supplyL = S.resL; S.cost = S.resL * 0.0025; S.runoffL = 0; S.drainL = 0;
    S.potA = bed ? BED.area : S.nplants * per / 1000 / POT_DEPTH;
    const den = m.how === 'soil' ? cap : Math.max(S.resL, 0.5 * cap);
    S.nutL = (ec0 - CROP_DATA.nutrients.professors.waterEC) * den; S.inertL = CROP_DATA.nutrients.professors.waterEC * den; S.ph = m.how === 'soil' ? Math.min((C.stages[0].ph[0] + C.stages[0].ph[1]) / 2, C.fe - 0.3) : 6.0; /* v66 (critic round 15 m4): soil started at the band top and its slow climb turned the pH tile amber by day 24; it starts mid band */ S.do2 = 8; // soil starts inside the crop's iron-lockout line (basil fe 6.2 used to start locked out) [M15]
    S.a.wet = 0; S.mlPerL = mlForEc(ec0);
    if (m.how === 'coco') S.drip = !!u.drip;
    if (out) S.canopyA = ver ? 0.75 : BED.area;
  }
  if (m.how === 'tower') {
    const n = slotCount(u, C.id), k = u.planted === undefined ? n : clamp(Math.round(+u.planted) || 0, 0, n);
    S.slots = []; for (let i = 0; i < n; i++) S.slots.push(i < k ? newSlot(C, 1) : emptySlot());
    S.plantedEver = k; S.nplants = Math.max(1, k); syncAgg(S);
  }
}

// ---------------------------------------------------------------------------
// Public data
// ---------------------------------------------------------------------------
const ACTIONS = [
  { id: 'mix', label: 'Mix nutrients', params: ['mlPerL'], desc: 'Dose A+B (ml/L each) so the tank reaches the EC on the Professor\'s chart. Only raises EC; add water to lower it.' },
  { id: 'phDown', label: 'Add pH down', params: ['ml'], desc: 'Add pH down (ml) to lower pH. About 1 ml per 10 L drops pH ~0.35. Go slow.' }, // [M-x] v44
  { id: 'phUp', label: 'Add pH up', params: ['ml'], desc: 'Add pH up (ml) to raise pH. Go slow.' }, // [M-x] v44
  { id: 'topUp', label: 'Top up tank', params: ['litres', 'withNutrients'], desc: 'Refill the tank toward full with plain water or with mixed nutrient solution.' },
  { id: 'changeRes', label: 'Change tank', params: [], desc: 'Dump the tank and mix fresh. Clears salt build-up and slime but wastes water.' },
  { id: 'lights', label: 'Lights', params: ['hours', 'dim'], desc: 'Set hours of light per day (0-24) and optional dimming (0.3-1). Less light = less heat and power.' },
  { id: 'prune', label: 'Prune leaves', params: [], desc: 'Remove lower leaves for airflow. Cuts mould risk for a few days, small growth hit.' },
  { id: 'spray', label: 'Spray pests', params: ['product'], desc: 'Neem oil knocks aphids, thrips and mites back about 70% (repeat in 5 days); soap spray knocks back soft bodies. With slugs active it lays bait; with powdery mildew it is a milk spray.' } /* [M-H] */,
  { id: 'calibrate', label: 'Calibrate meters', params: [], desc: 'Re-zero your EC and pH meters. They drift over time.' },
  { id: 'fan', label: 'Fan speed', params: ['level'], desc: 'Set the extraction fan: 0 off, 1 low (150 m3/h), 2 medium (300), 3 high (450). More air cools the tent and dries it out; less air keeps heat and humidity in.' },
  { id: 'humidity', label: 'Humidity appliance', params: ['mode'], desc: 'Small humidifier / dehumidifier (about 40 W): mode off, humidify (about +12% RH at low fan) or dehumidify. Evaporating water cools the tent and condensing it warms it, so the humidifier also cools a hot tent and the dehumidifier warms a cold one.' },
  { id: 'harvest', label: 'Harvest', params: [], desc: 'Pick everything that is ready. Fruit crops keep producing; basil is cut back (about two thirds stays and regrows); lettuce heads end the crop.' } // [M-x] v44
];

function defaultSetup() {
  return { tent: { area_m2: 1.44, volume_m3: 2.9 }, light: { watts: 240, umolPerJ: 2.5 }, fanM3h: 300, humMode: 'off', medium: 'hydro',
    reservoirL: 30, airPump: false, meters: { ec: false, ph: false, thermo: false, par: false }, season: 'spring', nutrientLine: 'professors' };
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------
function create(cropId, setup) {
  const key = cropId;
  const C = CROP_DATA[key];
  if (!C || !C.stages) throw new Error('Unknown crop ' + cropId);
  const d = defaultSetup(), u = setup || {};
  const mth = normMethod(u);
  const su = {
    tent: Object.assign({}, d.tent, u.tent), light: Object.assign({}, d.light, u.light),
    fanM3h: u.fanM3h === undefined ? d.fanM3h : u.fanM3h, humMode: u.humMode || 'off', medium: mth.legacyMedium ? (u.medium || d.medium) : HOW_MEDIUM[mth.how],
    reservoirL: u.reservoirL || d.reservoirL, airPump: !!u.airPump,
    meters: Object.assign({}, d.meters, u.meters), season: u.season || d.season, nutrientLine: u.nutrientLine || d.nutrientLine, heatwaveC: +u.heatwaveC || 0, // events.js: optional outdoor offset (C)
    seed: u.seed === undefined ? 1234 : u.seed };
  if (u.phDoseScale > 0 && u.phDoseScale < 1) su.phDoseScale = +u.phDoseScale; // ui.js: beginner and free grows get a gentler pH tap (0.5); unset = full strength, so challenge and harness tuning are unchanged
  if (u.mods) su.mods = Object.assign({}, u.mods); // optional modifiers (Weekly Challenge): dT outdoor degC, ea outdoor vapour kPa, tapPh, tapEC
  const V = su.reservoirL, ec0 = 0.8;
  const S = {
    cropId: key, setup: su, seed: su.seed, rng: su.seed >>> 0, nplants: nplantsFor(mth, C, su, u),
    t: 0, day: 1, hour: 8, doy0: C.climate ? 0 : CROP_DATA.climate.startDoy[su.season] || 263,
    stage: 0, gdd: 0, mature: false, matureAnnounced: false, health: 100,
    lightHours: null, dim: 1, lit: true, wx: { dT: 0, dew: 0, hw: 0 },
    airT: 20, ea: 1.2, rh: 60, vpd: 1, Eg: 0, wT: 19,
    cap: V, resL: V, nutL: (ec0 - CROP_DATA.nutrients.professors.waterEC) * V, inertL: CROP_DATA.nutrients.professors.waterEC * V, ph: 6.0, mlPerL: mlForEc(ec0), do2: 8,
    wilt: 0, bio: 0.3 * (C.leafK || 120) / 120, leaf: 0.01, fruitKg: 0, hist: [], harvestedKg: 0, ripeAlert: -99,
    pruneDays: 0, pruneCool: 0, pestLevel: 0, immune: 0, drift: { ec: 0, ph: 0 },
    a: { ber: 0, iron: 0, ecH: 0, low: 0, rot: 0, bot: 0, heat: 0, crack: 0, cold: 0, dryHot: 0, dryAir: 0, tip: 0, bolt: 0, dm: 0, pm: 0, bit: 0, curl: 0, captip: 0, smallfruit: 0, aphid: 0, thinfruit: 0, greymould: 0, runners: 0, smallberry: 0, slugbite: 0, rootrot: 0, fusarium: 0, spidermite: 0, mushyfruit: 0 },
    cropDone: false, lastCut: -99,
    pr: {}, acc: { sum: 0, w: 0, dli: 0 }, dliLast: 0,
    supplyL: V, runoffL: 0, kWh: 0, refKWh: 0, cost: V * 0.0025, nutrientMl: 0, refills: 0, acts: 0, replay: null, rp: null
  };
  S.doy0 = CROP_DATA.climate.startDoy[su.season] || 263;
  initMethod(S, mth, u, C);
  newDayWeather(S);
  const o = outdoorNow(S);
  S.airT = 20; S.ea = o.ea; S.wT = 18; // [M-H] M25: a warm start (air 20, water 18) so day one is not a wall of red
  if (S.out) { const oh = outsideHour(S, S.doy0), sT = es(oh.T); S.airT = oh.T; S.ea = oh.ea; S.wT = oh.T - 1; S.rh = clamp(100 * oh.ea / sT, 5, 99.5); S.vpd = sT * (1 - S.rh / 100); S.sunNow = oh.sun; S.ppfdNow = oh.sun; S.lit = oh.sun > 5; } // the first reading is the real 09:00 outside, not the tent defaults [M16]
  /* v70 (Command Centre, sweep of round 14 m2): the default light suits the crop. v71 (critic round 18 m3): per stage, not once: the driver turns down only while a stage would be over its PPFD or DLI band top at the hours set (chilli seedlings read 521 PPFD against 150-450 all chapter), and never below the band; a setup that names its dim keeps it, and the legacy create (no where or how) keeps the old engine run */
  if (u.dim !== undefined) S.dim = clamp(+u.dim, 0.3, 1);
  else if (!S.out && !mth.legacyMedium && su.light && su.tent) { S.autoDim = true; S.dim = autoDim(S); }
  S.dliLast = S.out ? 0 : ppfdNow(S) * photoperiod(S) * 3.6 / 1000; // outside there is no 'yesterday' to report on day one
  return S;
}

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------
const PH_TAP_ML = 4 /* ui.js pH buttons; a dose of 3 ml or more counts as a tap */, PH_TAP_MIN = 0.15, PH_TAP_PAD = 0.02; /* PAD: the hour of drift and mixing after a tap (up to about 0.02) must not push the reading out of [min, half band] */ // v50: the pH buttons add 4 ml (ui.js); one such tap moves pH from 0.15 up to half the stage's pH band
const stageOf = S => CROP_DATA[S.cropId].stages[S.stage];
const photoperiod = S => S.out ? S.dayLen : S.lightHours === null ? stageOf(S).photoperiod : S.lightHours;
const ppfdNow = S => S.out ? (S.sunNow || 0) : S.setup.light.watts * S.dim * S.setup.light.umolPerJ / S.setup.tent.area_m2;
// Upper limit on transpiration (g of water per hour, whole tent) while the lamp is on. Transpiration is an energy balance: a leaf can only
// evaporate what the absorbed light (plus a little dry-air advection) pays for, 1 W = 3600 s / 2450 J/g = 1.47 g/h of water.
//   radiant PAR = ppfd / 4.57 umol/J (white LED) per m2 of canopy;  ~85 % absorbed by a closed canopy in a reflective tent;
//   advection (Penman-Monteith aerodynamic term) lifts that by ~1.3 at VPD 1.1 kPa and scales with VPD: 0.7 + 0.55 x VPD.
// For the default 300 W / 1.44 m2 kit (ppfd ~520): 520/4.57 x 1.44 x 0.85 x 1.3 x 1.47 = ~265 g/h, i.e. ~3.5 L/day over 14 h, which is
// ~1.7 L/plant/day for the 2 tomato plants (literature 1-2 L/day for a mature tomato under artificial light).
// The crop uptake figures alone (up to 3 L/plant/day x vpd and heat multipliers) gave 380-520 g/h: more than the whole lamp could evaporate,
// which is why the tent ran so damp that no fan setting plus the 230 g/h dehumidifier could hold the VPD band.
const ET_ABS = 0.85, ET_PAR_UMOL_PER_J = 4.57, ET_G_PER_WH = 3600 / 2450, LATENT_W_PER_GH = 2450 / 3600;
function etCapGh(S, ppfd, vpd) {
  return ppfd / ET_PAR_UMOL_PER_J * (S.canopyA || S.setup.tent.area_m2) * ET_ABS * (0.7 + 0.55 * clamp(vpd, 0.2, 2.5)) * ET_G_PER_WH;
}
function stageProgress(S) {
  if (S.mature) return 1;
  return clamp(S.gdd / (stageOf(S).days * 10.5), 0, 1); // 10.5 GDD/day at ~20.5C = reference pace
}
function monthly(arr, doy) { // smooth cyclic interpolation between month mid-points
  const x = (((doy - 1) % 365) / 30.4375) - 0.5, i = Math.floor(x), f = x - i;
  return lerp(arr[(i + 12) % 12], arr[(i + 13) % 12], f);
}
function newDayWeather(S) {
  const wx = S.wx, doy = S.doy0 + S.day - 1, c = CROP_DATA.climate;
  wx.dT = 0.65 * wx.dT + 1.8 * gauss(S);
  wx.dew = 0.6 * wx.dew + 1.0 * gauss(S);
  if (wx.hwLeft > 0) wx.hwLeft--;
  else if (rand(S) < (monthly(c.max, doy) > 26 ? 0.03 : 0.008)) wx.hwLeft = 3 + Math.floor(rand(S) * 3);
  wx.hw = wx.hwLeft > 0 ? 5.5 : 0;
  wx.hwStart = wx.hwLeft > 0 && !S._hwOn; S._hwOn = wx.hwLeft > 0;
  if (S.out) outsideDay(S, doy);
}
function outdoorNow(S, loc) { // loc: the Byford bed / pots (inland, ~30 km SE of the Perth city normals): nights 2.5 C colder, days 0.5 C warmer [M5]
  const c = CROP_DATA.climate, doy = S.doy0 + S.day - 1, h = S.hour, wx = S.wx;
  const hwc = (S.setup && S.setup.heatwaveC) || 0;
  const mx = monthly(c.max, doy) + wx.dT * 0.8 + wx.hw + hwc + (loc ? 0.5 : 0), mn = monthly(c.min, doy) + wx.dT * 0.5 + wx.hw * 0.4 + hwc + (loc ? -2.5 : 0);
  let s; // 0..1 diurnal shape: min ~05:00, max ~15:00
  if (h >= 5 && h <= 15) s = (1 - Math.cos(Math.PI * (h - 5) / 10)) / 2;
  else s = (1 + Math.cos(Math.PI * (((h - 15 + 24) % 24)) / 14)) / 2;
  const md = S.setup.mods, T = mn + (mx - mn) * s + (md && md.dT || 0);
  return { T: T, Tmean: (mn + mx) / 2 + (md && md.dT || 0), ea: es(Math.min(monthly(c.dew, doy) + wx.dew, T - 0.5)) + (md && md.ea || 0) };
}

// ---------------------------------------------------------------------------
// Plant factors (each 0..1) for the current hour
// ---------------------------------------------------------------------------
function factors(S) {
  const C = CROP_DATA[S.cropId], s = stageOf(S), V = S.resL;
  const tb = S.lit ? s.tempDay : s.tempNight;
  const ecTot = ecTotal(S), ecNut = S.pot ? S.nutL / potDen(S) + 0.15 : V > 0.05 ? S.nutL / V + 0.15 : 0;
  const fLow = ecNut >= s.ec[0] - 0.5 ? 1 : Math.pow(2, -Math.pow((s.ec[0] - 0.5 - ecNut) / 1.0, 2));
  const fHigh = band(ecTot, 0, s.ec[1] + 0.7, 1, 1.2);
  const ironF = 1 - 0.2 * (S.pr.iron || 0);
  const o2f = band(S.do2, 5.5, 99, 2, 1);
  return {
    t: band(S.airT, S.out ? Math.min(tb[0] - 2, (C.baseT === undefined ? 10 : C.baseT) + 0.25 * (tb[0] - (C.baseT === undefined ? 10 : C.baseT))) - CHILL_GRACE : tb[0] - 2, tb[1] + 4 + (S.out ? (C.hotGrace === undefined ? HOT_GRACE : C.hotGrace) : 0), 4, S.out ? 4.5 : 3.5), // outdoors the cold edge sits a quarter of the way from the crop's base temperature up to its night target [M12]
    ec: Math.min(fLow, fHigh),
    ph: band(S.ph, s.ph[0] - 0.4, s.ph[1] + 0.4, 0.6, 0.6) * ironF,
    vpd: band(S.vpd, S.out ? 0.05 : Math.max(0.25, s.vpd[0] - 0.15), s.vpd[1] + (S.out ? 1.5 : 0.6), 0.3, S.out ? 3 : 0.8), // outdoors a damp night or a rainy day costs nothing (no low-VPD edge) and a dry afternoon is taken in stride (+1.0 kPa, tolerance 1.6): the tent bands are tent-tuned [M12]
    w: 1 - 0.85 * S.wilt,
    o2: S.setup.medium === 'coco' ? 0.5 + 0.5 * o2f : o2f
  };
}
function ecTotal(S) { if (S.pot) return clamp((S.nutL + S.inertL) / potDen(S), 0, 12); return S.resL > 0.05 ? clamp((S.nutL + S.inertL) / S.resL, 0, 12) : 0; }
// Product of problem penalties (BER, heat, cold, cracking, mould, rot, pests).
function setMult(S) { const p = S.pr; return (1 - 0.15 * (p.ber || 0)) * (1 - 0.2 * (p.heat || 0)) * (1 - 0.05 * (p.crack || 0)) * (1 - 0.1 * (p.cold || 0)) *
  (1 - 0.15 * (p.tip || 0)) * (1 - 0.2 * (p.bolt || 0)) * (1 - 0.15 * (p.bit || 0)) *
  // pass 8 crop problems: fruit size and set (small / thin / soft fruit, grey mould on berries, runners) and a small leaf-area cost, per severity level 1..3
  (1 - 0.05 * (p.smallfruit || 0) - 0.03 * ((p.thinfruit || 0) + (p.smallberry || 0)) - 0.07 * (p.mushyfruit || 0) - 0.06 * (p.greymould || 0) - 0.05 * (p.runners || 0) - 0.02 * ((p.curl || 0) + (p.captip || 0))); }
function probMult(S) { const p = S.pr, C = CROP_DATA[S.cropId]; return (1 - 0.1 * (p.botrytis || 0)) * (1 - 0.15 * (p.rot || 0)) * (1 - 0.12 * S.pestLevel) * (1 - 0.05 * (p.ecburn || 0)) *
  (1 - 0.2 * (p.dm || 0)) * (1 - 0.12 * (p.pm || 0)) * (1 - 0.08 * (p.tip || 0)) * (1 - 0.1 * (p.bolt || 0)) * (1 - 0.08 * (p.bit || 0)) * (1 - (C.coldPen || 0) * (p.cold || 0)) *
  (1 - 0.05 * ((p.aphid || 0) + (p.spidermite || 0)) - 0.03 * ((p.slugbite || 0) + (p.curl || 0) + (p.captip || 0) + (p.greymould || 0)) - 0.08 * (p.rootrot || 0) - 0.1 * (p.fusarium || 0) - 0.02 * (p.runners || 0)) * (1 - 0.1 * (p.soggy || 0)) * (1 - CHILL_MAX * Math.min(1, ((S.a && S.a.chill) || 0) / CHILL_FULL)) * (S.out ? outMult(S) : 1); } // [M-OUT]

// [M29] plant loss and [M33] Eco counters. Everything here is gated: S.eco is created on the first hour, S.zh only exists while health sits at 0, S.lost only after the loss.
const STUNT_HOURS = 72, STUNT_HEALTH = 20, STUNT_FROM_DAY = 14; // [M29] v48 under 20 health for 72 game hours in a row loses any plant, once it is past its first fortnight
const LOST_HOURS = 48; // [M29] hours at health 0 before the plant is lost
const LOST_WHY = { // [M29] plain, number-free reasons by tile: [low / default, high]
  moisture: ['It dried right out and never got watered.', 'The roots sat soaked and could not breathe.'], ec: ['The feed was far too weak and it starved.', 'The feed was far too strong and burned the roots.'],
  ph: ['The pH was so far off the roots could not take up any food.', 'The pH was so far off the roots could not take up any food.'], airTemp: ['It got too cold and nothing covered or warmed it.', 'It got too hot and nothing cooled it.'],
  rh: ['The air was too dry for the leaves.', 'The air stayed too damp and mould moved in.'], vpd: ['The air was too damp for the leaves to breathe out.', 'The air was too dry for the leaves.'],
  waterTemp: ['The tank water got too cold for the roots.', 'The tank water got too warm for the roots.'], reservoirL: ['The tank ran dry.', 'The tank ran dry.'], do2: ['The roots ran out of oxygen.', 'The roots ran out of oxygen.'],
  stunted: ['It sat under 20 percent health for three days with nothing coming right. Start again, and act on the first red tile.', 'It sat under 20 percent health for three days with nothing coming right. Start again, and act on the first red tile.'], // [M29] v48 stunted, past saving
  ppfd: ['It got far too little light.', 'The light was far too harsh.'], dli: ['It got far too little light.', 'The light was far too harsh.'] };
const LOST_TITLE = { stunted: ['Past saving', 'Past saving'], moisture: ['the soil dried out', 'the soil stayed too wet'], ec: ['the feed was too weak', 'the feed was too strong'], ph: ['the pH went off', 'the pH went off'], airTemp: ['it got too cold', 'it got too hot'], rh: ['the air was too dry', 'the air stayed too damp'], vpd: ['the air was too damp', 'the air was too dry'], reservoirL: ['the tank ran dry', 'the tank ran dry'], do2: ['the roots ran short of air', 'the roots ran short of air'], dli: ['not enough light each day', 'too much light each day'] }; // [M-x] v47 plain Lost headlines
function loseCrop(S, evs, stunted) { // [M29] the cause comes from the raw state (meters or not): a problem if one is dragging growth below the worst factor, else the worst tile
  const f = S.lastF || factors(S), st = stageOf(S), tb = S.lit ? st.tempDay : st.tempNight, pot = !!S.pot;
  const mo = pot && S.cap ? S.resL / S.cap : 0.5, dr = S.dliLast > 0 && st.dli && st.dli[0] ? S.dliLast / st.dli[0] : 1; // [M-x] v47 real direction for the soil, and a light factor
  const wetF = pot && mo > 0.85 && S.a && S.a.wet > 24 ? Math.max(0.2, 1 - (S.a.wet - 24) / 96) : 1; // [M-x] v47 hours soaked cost the root zone its air, so a drowned pot is blamed on water, not on dryness
  const fs = [['airTemp', f.t, S.airT > tb[1]], ['ec', f.ec, ecTotal(S) > st.ec[1]], ['ph', f.ph, S.ph > st.ph[1]], ['vpd', f.vpd, S.vpd > st.vpd[1]], [pot ? 'moisture' : 'reservoirL', pot ? Math.min(f.w, wetF) : f.w, pot && wetF < f.w], ['do2', f.o2, false], ['dli', dr < 0.8 ? dr : 1, false]]; // [M-x] v47
  fs.sort((x, y) => x[1] - y[1]);
  let cause = 'Not enough care', why = 'Nothing stayed in range long enough for it to recover.', key = null;
  const d = diagnose(S)[0];
  if (probMult(S) < fs[0][1] && d) { cause = d.title; why = d.why; }
  else if (fs[0][1] < 0.95) {
    key = fs[0][0]; const L = LOST_WHY[key], hi = fs[0][2], coco = key === 'moisture' && methodOf(S).how === 'coco';
    cause = LOST_TITLE[key] ? LOST_TITLE[key][hi ? 1 : 0] : WHY_TITLE[key]; if (coco) cause = cause.replace('soil', 'coco'); why = L ? L[hi ? 1 : 0] : 'It stayed out of range for too long.'; // [M-x] v47 no code words
    if (key === 'reservoirL') why = L[0];
  } else if (d) { cause = d.title; why = d.why; }
  if (stunted) { /* v49b (play-test #9): the stunted ending keeps the real cause when there is one; a ripe crop left on the plant says so */
    if (S.mature && ripeKg(S) >= 0.02) { key = 'unpicked'; cause = 'it sat ripe and unpicked'; why = 'It was ready to pick and waited too long. Pick when the card says ready.'; }
    else if (key || cause !== 'Not enough care') { why = why + ' It then sat under 20 percent health for three days.'; if (!key) key = 'stunted'; }
    else { key = 'stunted'; cause = LOST_TITLE.stunted[0]; why = LOST_WHY.stunted[0]; }
  }
  S.lost = { day: S.day, cause: cause, why: why, key: key };
  S.cropDone = true; S.mature = false; S.health = 0; S.hist = []; S.fruitKg = 0; delete S.zh;
  if (S.slots) S.slots.forEach(sl => { if (sl.planted !== null && sl.planted !== undefined) { sl.cropDone = true; sl.health = 0; sl.hist = []; sl.kg = 0; } });
  evs.push(ev('info', 'plant_lost', 'Plant lost', 'Lost on day ' + S.day + ': ' + cause + '. ' + why, 3, [], ''));
}
function lossCheck(S, evs) { // [M29] health at 0 for 48 game hours; a recovery to 3 or more resets the clock
  if (S.cropDone || S.lost) return;
  if (S.health < 2) S.zh = (S.zh || 0) + 1; else if (S.zh && S.health >= 4) delete S.zh; // a plant forced to 0 climbs about a point an hour, so "at zero" is under 2
  if (S.zh >= LOST_HOURS) return loseCrop(S, evs);
  const E = S.eco; // [M29] v48 stunted: the run of hours under 20 health lives in S.eco.lo (serialized with it), counted from day 14 so a rough seedling start is not a loss
  if (E && S.day >= STUNT_FROM_DAY) { if (S.health < STUNT_HEALTH) { E.lo = (E.lo || 0) + 1; if (E.lo >= STUNT_HOURS) loseCrop(S, evs, true); } else if (E.lo) E.lo = 0; }
}
function ecoHour(S, lit) { // [M33] the player-driven Eco counters: feed in band, and hours of climate the player's levers could have fixed or wasted
  if (S.cropDone) return;
  const E = S.eco || (S.eco = { n: 0, fe: 0, bad: 0, sp: 0, ls: -1, dh: 0, sh: 0, lh: 0 }), f = S.lastF, s = stageOf(S), tb = lit ? s.tempDay : s.tempNight, T = S.airT;
  if (E.th == null) E.th = E.n; E.th += clamp((S.health - 30) / 40, 0, 1); // [M33] v48 thrive credit: 1 at 70 health or more, 0 under 30
  E.n++; if (f && f.ec >= 0.99) E.fe++;
  const hot = T > tb[1], cold = T < tb[0]; let bad = 0;
  if (S.out) {
    if (hot && lit && !S.shade) bad = 1; // heat with the shade off
    else if (cold && !S.cover) bad = 1; // cold with no cover
    else if (S.cover && lit) bad = 1; // covered through daylight
    if (lit) { E.lh++; if (S.shade) E.sh++; if (hot) E.dh = 1; }
  } else {
    const lv = fanLevel(S);
    if (hot && lv < 3) bad = 1; else if (cold && lv >= 2) bad = 1; else if (!hot && !cold && lv >= 3) bad = 1; // heat with the fan not up, cold with the fan up, fan flat out when the air was fine
  }
  E.bad += bad;
}
function ecoDay(S) { const E = S.eco; if (!E) return; if (E.lh > 0 && E.sh >= 0.5 * E.lh && !E.dh) E.bad += E.lh; E.dh = 0; E.sh = 0; E.lh = 0; } // [M33] a whole day under shade with no heat is a wasted day
function ecoSpray(S) { const E = S.eco || (S.eco = { n: 0, fe: 0, bad: 0, sp: 0, ls: -1, dh: 0, sh: 0, lh: 0 }); if (E.ls !== S.day) { E.ls = S.day; E.sp++; } } // [M33] neem or soap only; bait and hand-picking never call this
function ecoParts(S) { // [M33] four parts of 25: water, feed, no spray, climate. Rounded so they sum to the score.
  const E = S.eco || { n: 0, fe: 0, bad: 0, sp: 0 }, up = S.uptakeL || 0, wasted = Math.max(0, (S.runoffL || 0) - (S.pot ? 0 : S.cap * S.day / 14)), tot = up + wasted; // a tank refresh every two weeks is good practice, so the tub and tower get that much free
  const thr = E.th == null ? 1 : clamp((E.th + 12) / (E.n + 12), 0, 1); // [M33] v48 water, feed and spray are credited only for the share of life the plant was thriving
  const water = thr * (tot < 0.5 ? 25 : 25 * clamp((up / tot - 0.2) / 0.6, 0, 1));
  const feed = thr * 25 * (E.fe + 12) / (E.n + 12), spray = thr * 25 * clamp(1 - E.sp / Math.max(S.day, 10), 0, 1), climate = 25 * clamp(1 - E.bad / (E.n + 12), 0, 1);
  return { water: Math.round(water), feed: Math.round(feed), spray: Math.round(spray), climate: Math.round(climate) };
}

// ---------------------------------------------------------------------------
// One hour
// ---------------------------------------------------------------------------
/* v60 (play-test #14 #5): Mist is a hygrostat appliance. A humidifier ran flat out and took a seedling tent to 96-100 % RH
   overnight (VPD 0.01 kPa); now it eases off over the last HYGRO RH points below the stage's top and stops at it. Returns the water it moves this hour, g/h (+ adds vapour). */
const HYGRO = 6;
function humGH(S, s) {
  const m = S.setup.humMode, rh = S.rh == null ? 60 : S.rh;
  if (m === 'humidify') return HUM_GH * clamp((s.rh[1] - rh) / HYGRO, 0, 1);
  if (m === 'dehumidify') return -HUM_GH; /* Dry runs flat out: the player turns it off (a hygrostat there cost the good grower's winter VPD hours, humidity-probe capsicum/winter 88 to 74 %) */
  return 0;
}
/* v60 (play-test #14 #3): the VPD a tent settles at this hour on a given fan flow, from the same balance step() uses. Axel only
   says "lower the fan" for dry air when it would really make the air less thirsty: under a lamp a slower fan mostly warms the
   tent, and the warmer air is thirstier (fan Med to Low on a seedling tent: 19.4 to 24.7 C, VPD 0.8 to 1.65 kPa). */
function vpdAtFan(S, fanM3h) {
  if (S.out) return S.vpd;
  const s = stageOf(S), su = S.setup, out = outdoorNow(S), lit = !!S.lit;
  const watts = lit ? su.light.watts * S.dim : 0, heat = watts * 0.85, latent = LATENT_W_PER_GH * (S.Eg || 0);
  const airflow = 1 + 0.25 * (S.pruneDays > 0 ? 1 : 0), vent = 0.2 * fanM3h * airflow, UA = 9 * Math.pow(su.tent.volume_m3, 2 / 3);
  const hg = humGH(S, s), applW = su.humMode === 'off' || !su.humMode ? 0 : HUM_W + Math.abs(hg) * LATENT_W_PER_GH * (hg > 0 ? -1 : 1);
  const roomT = out.Tmean == null ? out.T : out.Tmean + CLIMATE.roomSwing * (out.T - out.Tmean);
  const T = 0.5 * roomT + 11 + (Math.max(0, heat - latent) + applW) / (vent + UA), sat = es(T);
  const Q = 0.6 * fanM3h * airflow + 10, ea = Math.min(Math.max(0.2, out.ea + ROOM_EA + ((S.Eg || 0) + hg) / Q / 7.3), sat * 0.995);
  return sat - ea;
}
/* v64 (critic round 13 #2): lights on and the air under the day band floor. Damp and dry fixes then never ask for more fan or dimmer lights, which would fight the cold-air fix */
function coolLit(S) { return !!S.lit && !S.out && S.airT < stageOf(S).tempDay[0]; }
function fanHelpsDry(S) {
  const f = S.setup.fanM3h, i = FAN_LEVELS.indexOf(f);
  if (S.out || i <= 1) return false; /* never down to Off */
  if (S.setup.humMode === 'humidify' && humGH(S, stageOf(S)) < HUM_GH) return false; /* the hygrostat is already easing off: the air is not short of water */
  return vpdAtFan(S, FAN_LEVELS[i - 1]) < vpdAtFan(S, f) - 0.05;
}
/* v60 (play-test #14 #4, Command Centre: a seedling propagator). Seedling bands are warm and damp (tomato 24-26 C, 70-85 %), and a default
   tent under its lamp sits at 20-22 C and 55-60 % in spring at any fan speed. Real growers raise seedlings in a propagator: a heat mat with
   a thermostat and a vented lid. In a tent the seedlings sit in one: it tops the air up towards the band floor (at most PROP.T C)
   and the damp up towards it (at most PROP.RH points), never past it, so a warm summer tent is unchanged. The air tile reads the air
   the seedlings are in and says so ("Propagator air", ui.js). After propagation the lid comes off over a day (S.domeK falls 1/24 an
   hour), so the tiles never jump, and Axel says so once (event prop_off). */
const PROP = { T: 5, RH: 20, STEP: 1.5 }; /* Command Centre: the lift reaches the crop's day floor, at most +5 C (v62, a heat mat under a dome); the closed dome holds the damp up to where the VPD sits just under its band top, at most +20 RH points (v63, critic round 12 #1) */
function propagator(S, s, evs) {
  const want = s.name === 'propagation' ? 1 : 0, k0 = S.domeK == null ? want : S.domeK;
  if (!want && k0 >= 1 && evs) evs.push(ev('info', 'prop_off', 'Lid off', 'Seedlings are big enough, lid off.', 0, [], ''));
  const k = S.domeK = clamp(k0 + clamp(want - k0, -1 / 24, 1 / 24), 0, 1);
  if (k <= 0) { S.domeT = 0; S.domeEa = 0; S.domeAir = null; return; }
  /* v62: a day setpoint (the day band floor) under the lamp and a night setpoint (the night floor) in the dark, so a warm-germinating
     crop (chilli 26-30 C by day, 21-24 C at night) is in band both ways. The box warms and cools at most PROP.STEP C an hour, so
     the switch between them never jumps (tests/v59.test.js bounds the hourly step). The setpoints are kept while the lid comes off. */
  if (want || !S.domeSet || S.domeSet.length < 4) S.domeSet = [s.tempDay[0] + 0.5, s.tempNight[0] + 0.5, s.rh[0] + 3, Math.min(s.tempDay[0] + 0.5, s.tempNight[1] - 0.3)];
  const L = photoperiod(S), toOn = (6 - S.hour + 24) % 24; /* hours until the lamp comes on (it is on from 06:00 for L hours) */
  const set = S.lit ? S.domeSet[0] : toOn > 0 && toOn <= 3 && L > 0 ? S.domeSet[3] : S.domeSet[1], T0 = S.airT, /* in the last 3 dark hours the mat warms the box towards the day floor, never past the night band's top */ rh0 = clamp(100 * S.ea / es(T0), 5, 99.5);
  let T1 = T0 + k * clamp(set - T0, 0, PROP.T);
  if (S.domeAir != null) T1 = clamp(T1, Math.min(S.domeAir - PROP.STEP, T0 + (S.domeT || 0)), S.domeAir + PROP.STEP); /* it never adds more heat than it already was to slow a fall */
  const dT = clamp(T1 - T0, 0, k * PROP.T); T1 = T0 + dT;
  const rhV = 100 * (1 - (s.vpd[1] - 0.05) / es(T1)), rh1 = rh0 + k * clamp(Math.min(s.rh[1] - 2, Math.max(S.domeSet[2], rhV)) - rh0, 0, PROP.RH), dE = Math.max(0, es(T1) * rh1 / 100 - S.ea); /* v63: the +5 C lift dried the air (red VPD 54-60 % of lit seedling hours); RH now rises to keep VPD just under the band top, never past the RH band's top */
  S.airT = T1; S.ea += dE; S.domeT = dT; S.domeEa = dE; S.domeAir = T1;
}
function autoDim(S) {
  const su = S.setup, st = stageOf(S), P0 = su.light.watts * su.light.umolPerJ / su.tent.area_m2, hrs = photoperiod(S) || st.photoperiod || 12;
  const byP = st.ppfd && st.ppfd[1] ? 0.95 * st.ppfd[1] / P0 : 1, byD = st.dli && st.dli[1] ? 0.95 * st.dli[1] / (P0 * hrs * 0.0036) : 1;
  return clamp(Math.round(Math.min(1, byP, byD) * 100) / 100, 0.3, 1);
}
function step(S, evs) {
  if (S.slots) syncAgg(S);
  if (S.autoDim && !S.out) S.dim = autoDim(S); /* v71: the driver follows the stage */
  const C = CROP_DATA[S.cropId], s = stageOf(S), su = S.setup, h = S.hour;
  const L = photoperiod(S);
  let lit = ((h - 6 + 24) % 24) < L;
  let oh = null; // the hour outside (veranda and garden grows): sun, air, rain, wind
  if (S.out) { oh = outsideHour(S, S.doy0 + S.day - 1); lit = oh.sun > 5; S.sunNow = oh.sun; S.coverDay = S.cover && oh.day ? (S.coverDay || 0) + 1 : S.cover ? (S.coverDay || 0) : 0; } // coverDay: daylight hours spent covered (pots left inside) [M15]
  if (S.replay) { const r0 = S.replay.rows[S.replay.i % S.replay.rows.length]; if (r0.light_on != null) lit = !!r0.light_on; else if (r0.ppfd_umol_m2_s != null) lit = r0.ppfd_umol_m2_s > 5; }
  S.lit = lit;
  const out = outdoorNow(S);
  // --- temperature ---
  const watts = lit && !S.out ? su.light.watts * S.dim : 0, heat = watts * 0.85, latent = LATENT_W_PER_GH * S.Eg; // latent = 2450 J/g = 0.68 W per g/h (was 0.34 while Eg was ~2x too high; the product, ~150 W, is unchanged)
  const airflow = 1 + 0.25 * (S.pruneDays > 0 ? 1 : 0);
  const vent = 0.2 * su.fanM3h * airflow, UA = 9 * Math.pow(su.tent.volume_m3, 2 / 3);
  // The humidity appliance is inside the tent, so its latent heat is a real heat flow: a dehumidifier condenses 230 g/h = 230 x 2450 J/g / 3600 = 156 W of latent
  // heat back into the air (plus its own 40 W), a humidifier evaporates the same 156 W out of it (net -116 W). Comparable to the lamp, so it moves temperature
  // as much as vapour pressure: evaporative cooling pulls VPD down twice (more vapour, lower T), a dehumidifier at night warms and dries the tent.
  const hgNow = humGH(S, s), applW = su.humMode === 'off' || !su.humMode ? 0 : HUM_W + Math.abs(hgNow) * LATENT_W_PER_GH * (hgNow > 0 ? -1 : 1); /* v60: the appliance's latent heat follows the water it actually moves (hygrostat) */
  /* v59 (play-test #13 #8): a tent stands in a room of the house, which swings about half as much as outdoors, and the tent, the pots and the
     tank give it thermal mass. It used to follow half the outdoor day-night swing and close 55 % of the gap every hour (7.5 to 8 C a day,
     up to 2.4 C in one hour); now the room is the day's mean plus half its swing and the gap closes 35 % an hour (tests/v59.test.js bounds it) */
  if (!S.out) { S.airT -= S.domeT || 0; S.ea -= S.domeEa || 0; } /* v60: the tent balance runs on the open tent's air; the propagator is added back below */
  const roomT = S.out ? out.T : (out.Tmean == null ? out.T : out.Tmean + CLIMATE.roomSwing * (out.T - out.Tmean));
  const Teq = 0.5 * roomT + 11 + (Math.max(0, heat - latent) + applW) / (vent + UA);
  if (S.out) S.airT = oh.T; else S.airT += (Teq - S.airT) * CLIMATE.airRelax;
  // --- humidity (vapour balance with ventilation) ---
  const Q = 0.6 * su.fanM3h * airflow + 10;
  // humidity appliance: +/-HUM_GH g/h of water vapour (~12% RH at 150 m3/h extraction)
  const hg = hgNow;
  if (S.out) S.ea = oh.ea; else S.ea += (Math.max(0.2, out.ea + ROOM_EA + (S.Eg + hg) / Q / 7.3) - S.ea) * CLIMATE.vapRelax; /* v59: was 0.7 an hour; the media, the tank and the walls buffer the vapour */
  if (!S.out) propagator(S, s, evs);
  const sat = es(S.airT);
  S.ea = Math.min(S.ea, sat * 0.995);
  S.rh = clamp(100 * S.ea / sat, 10, 99.5);
  S.vpd = sat * (1 - S.rh / 100);
  // --- CSV replay: measured climate overrides the modelled one ---
  let row = null;
  if (S.replay) {
    row = S.replay.rows[S.replay.i % S.replay.rows.length]; S.replay.i++;
    const rT = row.air_temp_c, T = rT == null ? S.airT : rT, sT = es(T);
    let rh = row.rh_pct != null ? row.rh_pct : row.vpd_kpa != null ? 100 * (1 - row.vpd_kpa / sT) : 100 * S.ea / sT;
    rh = clamp(rh, 5, 99.5); S.airT = T; S.rh = rh; S.ea = sT * rh / 100; S.vpd = sT * (1 - rh / 100);
    S.domeT = 0; S.domeEa = 0; /* v60: measured air has no modelled propagator */
    if (row.rh_pct != null && row.vpd_kpa != null) S.vpd = row.vpd_kpa;
    if (row.light_on != null) S.lit = lit = !!row.light_on; else if (row.ppfd_umol_m2_s != null) S.lit = lit = row.ppfd_umol_m2_s > 5;
  }
  // --- light ---
  const ppfd = row && row.ppfd_umol_m2_s != null ? row.ppfd_umol_m2_s : lit ? ppfdNow(S) : 0;
  S.ppfdNow = ppfd;
  S.acc.dli += ppfd * 3.6 / 1000;
  // --- water uptake ---
  const sp = stageProgress(S);
  const U = S.cropDone ? 0 : S.slots ? towerUptake(S) : lerp(s.uptake[0], s.uptake[1], Math.pow(sp, 0.8)) * S.nplants;
  const wt = lit ? 0.88 / L : (L < 24 ? 0.12 / (24 - L) : 0);
  let want = U * wt * clamp(0.5 + 0.7 * S.vpd, 0.5, 1.7) * clamp(1 + 0.04 * (S.airT - 22), 0.6, 1.5) * (oh ? 1 + 0.01 * oh.wind : 1); // wind strips water from leaves and soil [M7]
  if (lit) want = Math.min(want, etCapGh(S, ppfd, S.vpd) / 1000); // transpiration is energy-limited: a lamp can only evaporate so much water (see etCapGh)
  const got = Math.min(S.resL, want); S.uptakeL = (S.uptakeL || 0) + got;
  const V0 = S.resL; S.resL -= got;
  if (S.pot) { const mo = S.resL / S.cap; if (mo < 0.3 && lit) S.wilt = Math.min(1, S.wilt + 0.01 + 0.1 * (1 - mo / 0.3)); else S.wilt = Math.max(0, S.wilt - 0.03); } // pots: under 30 % moisture by day the plants wilt, faster the drier it is [M3]
  else if (want > 1e-6 && got < want * 0.999) S.wilt = Math.min(1, S.wilt + 0.1); else S.wilt = Math.max(0, S.wilt - 0.03);
  S.Eg = got * 1000;
  if (S.pot) { // pots: the plant draws feed at the concentration of its root zone; soil's buffering cuts the draw to SOIL_DRAW [M4]
    const den = S.method.how === 'soil' ? S.cap : Math.max(V0, 0.5 * S.cap), ec = clamp((S.nutL + S.inertL) / den, 0, 12);
    const r = Math.min(1, s.r * clamp(1.3 - 0.15 * ec, 0.5, 1.3)) * (S.method.how === 'soil' ? SOIL_DRAW : 1);
    S.nutL = Math.max(0, S.nutL - got * (S.nutL / den) * r);
    S.inertL = Math.max(0, S.inertL - got * (S.inertL / den) * 0.45 + got * 0.02);
  } else if (V0 > 0.05) { // nutrient removal at ratio r (<1) => EC concentrates as the tank shrinks
    const ec = ecTotal(S), r = Math.min(1, s.r * clamp(1.3 - 0.15 * ec, 0.5, 1.3));
    S.nutL = Math.max(0, S.nutL - got * (S.nutL / V0) * r);
    S.inertL = Math.max(0, S.inertL - got * (S.inertL / V0) * 0.45 + got * 0.02); // plants take up some tap-water minerals; the rest slowly builds up
  }
  // --- pH, solution temperature, dissolved oxygen ---
  const phK = (su.mods && su.mods.phDrift) || 1; /* v67 (story review M2): a chapter can slow the drift (chapter 1 eyes only) */
  if (S.pot) S.ph = clamp(S.ph + (S.method.how === 'soil' ? 0.004 : 0.05) / 24 * phK, 3.5, 8.5); // soil is buffered: +0.004 a day; coco +0.05 like the reservoir [M4]
  else {
  const drift = su.medium === 'coco' ? 0.05 : 0.15, rel = S.out ? 1 : U > 0 ? Math.min(2, got / (Math.min(U, etCapGh(S, ppfdNow(S), 1.1) / 1000 * L / 0.88) / 24)) : 0.6; // vs the energy-limited daily uptake, so pH drift keeps its 0.05 / 0.15 per day
  S.ph = clamp(S.ph + drift / 24 * (0.6 + 0.4 * rel) * phK, 3.5, 8.5);
  }
  S.wT += (S.airT - 1 + (su.airPump ? 0.6 : 0) - S.wT) * 0.04;
  if (row) { // measured solution values (where present) replace the modelled ones
    if (row.reservoir_l != null) { S.resL = Math.max(0, row.reservoir_l); if (S.resL > S.cap) S.cap = S.resL; }
    if (row.ec_mscm != null && S.resL > 0.05) S.nutL = Math.max(0, row.ec_mscm * S.resL - S.inertL);
    if (row.ph != null) S.ph = clamp(row.ph, 3.5, 9);
    if (row.water_temp_c != null) S.wT = row.water_temp_c;
  }
  if (S.pot) S.do2 = 8 - 3.5 * clamp((S.a.wet || 0) / 48, 0, 1); // pots: oxygen at the roots falls once the root zone has sat soaked for a day or two [M3]
  else {
  const satO2 = 14.6 - 0.39 * S.wT + 0.0057 * S.wT * S.wT;
  const eff = su.airPump ? 0.95 : (su.medium === 'hydro' ? 0.72 : 0.78);
  S.do2 = Math.max(0.5, satO2 * eff - 0.7 * Math.min(2, S.bio * S.nplants / (S.resL + 10) * 0.04));
  }
  // --- plant response ---
  if (S.slots) { // tower: each plant answers to the shared tank at its own stage
    S.slots.forEach(sl => { if (live(sl)) { const e2 = []; inSlot(S, sl, () => plantResponse(S, e2, lit)); pushUniq(evs, e2); } });
    syncAgg(S);
  } else plantResponse(S, evs, lit);
  // --- energy & cost ---
  const kw = S.out ? (S.drip ? 0.002 : 0) : (watts + su.fanM3h * FAN_W_PER_M3H + (su.airPump ? 5 : 0) + (su.humMode === 'off' ? 0 : HUM_W) + (S.drip ? 2 : 0)) / 1000;
  S.kWh += kw; // reference: efficient LED (2.7 umol/J) delivering this stage's mid DLI + a 300 m3/h fan
  if (!S.out) S.refKWh += (((s.dli[0] + s.dli[1]) / 2) * su.tent.area_m2 / (2.7 * 3.6) + 0.03 * 24) / 24; S.cost += kw * 0.324;
  // --- problems ---
  if (S.pot) potHour(S, lit, ppfd, oh);
  if (S.out) { S.rainLog.push(oh.rain); S.rainLog.shift(); S.windNow = oh.wind; }
  if (!S.cropDone) problems(S, evs, out, lit, ppfd);
  if (S.slots) towerPest(S);
  ecoHour(S, lit); lossCheck(S, evs); // [M33] [M29]
}


// One hour of plant response to the current factors: health, growth stage clock. Called once per plant (per slot in a tower).
function plantResponse(S, evs, lit) {
  const C = CROP_DATA[S.cropId], s = stageOf(S), su = S.setup;
  const f = factors(S), minF = Math.min(f.t, f.ec, f.ph, f.vpd, f.w, f.o2);
  S.lastF = f; S.minF = minF;
  const wgt = lit ? 1 : 0.4;
  S.acc.sum += wgt * minF; S.acc.w += wgt;
  const tgt = 100 * minF * probMult(S);
  if (!S.cropDone) S.health = clamp(S.health + (tgt - S.health) * (tgt < S.health ? 0.05 : 0.012), 0, 100);
  const T = S.airT, bT = C.baseT === undefined ? 10 : C.baseT; // thermal time above the crop's base temp, scaled so ~20.5C still gives 10.5 GDD/day
  const eT0 = (T <= 30 ? T - bT : (30 - bT) - 2 * (T - 30)) * (10.5 / (20.5 - bT));
  const eT = S.domeK > 0 && !S.out ? Math.min(eT0, 10.5) : eT0; /* v60: under the propagator the seedling stage runs at the table's pace, not faster (the stage days are propagator days; growers.js and the pick-day copy read them) */
  if (!S.mature && !S.lost) { // [M29] a lost plant stops its clock
    S.gdd += Math.max(0, eT) / 24 * (0.7 + 0.3 * S.health / 100);
    if (S.gdd >= s.days * 10.5) advanceStage(S, evs);
  }
}

function advanceStage(S, evs) {
  const C = CROP_DATA[S.cropId];
  if (S.stage < C.stages.length - 1) {
    S.gdd -= stageOf(S).days * 10.5; S.stage++;
    const s = stageOf(S);
    evs.push(ev('stage', 'stage_' + s.name, 'Stage: ' + s.name, 'Your ' + C.name + ' has reached ' + s.name + '. Targets changed: EC ' + s.ec.join('-') + ', pH ' + s.ph.join('-') + ', ' + s.photoperiod + 'h light.', 0, ['mix'], 'EC meter'));
  } else {
    S.mature = true; S.gdd = 0;
    evs.push(ev('harvest', 'crop_mature', 'Crop complete', C.matureMsg || ('All ' + (C.noun || 'fruit') + ' is ripe. Harvest now!'), 0, ['harvest'], ''));
  }
}

// ---------------------------------------------------------------------------
// Problems: accumulators + severity (0-3). Event is emitted when severity rises.
// ---------------------------------------------------------------------------
const GATED = { heat: 1, crack: 1, ber: 1, tip: 1, bolt: 1, dm: 1, pm: 1, bit: 1, curl: 1, captip: 1, smallfruit: 1, aphid: 1, thinfruit: 1, greymould: 1, runners: 1, smallberry: 1, slugbite: 1, rootrot: 1, fusarium: 1, spidermite: 1, mushyfruit: 1 };
const NEW_KEYS = ['curl', 'captip', 'smallfruit', 'aphid', 'thinfruit', 'greymould', 'runners', 'smallberry', 'slugbite', 'rootrot', 'fusarium', 'spidermite', 'mushyfruit'];
// Pass 8: crop-specific problems. One row per problem: plain-English title / why (the card) / fix (Ask Axel), the fix buttons to point at and a shop hint.
// Every string is at most 110 characters. Severity (S.pr[id], 0..3) comes from the accumulator S.a[id] through th(); ramps live in problems() below.
const NEWP = {
  curl: { crop: 'tomato', title: 'Leaf curl from heat', why: 'Hot, dry air is rolling the leaf edges up into tight little tubes.', fix: 'Fix: lift the fan speed or shorten the light hours to cool the tent. New leaves should come through flat.', acts: ['fan', 'lights'], hint: 'Fan speed controller' },
  captip: { crop: 'capsicum', title: 'Tipburn on young leaves', why: 'Calcium is not reaching the new leaf tips, so they brown off and go crisp.', fix: 'Fix: keep the air moving, hold EC and pH in range and add Cal-Mag.', acts: ['fan', 'changeRes'], hint: 'Cal-Mag supplement' },
  smallfruit: { crop: 'capsicum', title: 'Small fruit: nights too cool', why: 'Cold nights are keeping the capsicums small and slowing new fruit.', fix: 'Fix: run the lights longer or slow the fan so the tent holds its heat overnight.', acts: ['lights', 'fan'], hint: 'Heater / heat mat' },
  aphid: { crop: 'chilli', title: 'Aphids on the tips', why: 'Tiny green aphids are clustering on the soft growing tips of over-fed or stressed plants.', fix: 'Fix: spray neem oil (again in 5 days), ease the feed back into range and keep the air moving.', acts: ['spray', 'fan'], hint: 'Pest spray (ask in store)' },
  thinfruit: { crop: 'chilli', title: 'Thin, pale chillies', why: 'There is not enough light, so the chillies are coming in thin and pale.', fix: 'Fix: lift the dimmer or add lighting hours until the daily light is back in range.', acts: ['lights'], hint: '' },
  greymould: { crop: 'strawberry', title: 'Grey mould on the berries', why: 'Damp air around the fruit is growing grey fuzz on the ripe berries.', fix: 'Fix: dry the air, lift the fan speed, prune lower leaves and pick ripe berries quickly.', acts: ['fan', 'prune'], hint: 'Dehumidifier' },
  runners: { crop: 'strawberry', title: 'Runners taking over', why: 'Long days and a strong feed make the plant throw runners instead of berries.', fix: 'Fix: cut the lights to 12 to 14 hours and ease the feed back into range.', acts: ['lights', 'topUp'], hint: 'EC meter' },
  smallberry: { crop: 'strawberry', title: 'Small berries: low light', why: 'There is not enough light, so the berries stay small and pale.', fix: 'Fix: lift the dimmer or add lighting hours until the daily light is back in range.', acts: ['lights'], hint: '' },
  slugbite: { crop: 'lettuce', title: 'Slugs chewing the leaves', why: 'Very damp air has slugs and snails chewing ragged holes in the outer leaves.', fix: 'Fix: prune dead leaves off the base and dry the air for two days. Slug bait helps.', acts: ['prune', 'fan', 'spray'], hint: 'Dehumidifier' },
  rootrot: { crop: 'lettuce', title: 'Warm tank: outer leaves limp', why: 'The tank is too warm for lettuce, so the roots struggle and outer leaves go yellow and limp.', fix: 'Fix: change the tank, add an air pump and shade it or run the fan harder to cool the water.', acts: ['changeRes', 'fan'], hint: 'Water chiller' },
  fusarium: { crop: 'basil', title: 'Pythium root rot: warm tank', why: 'A warm, airless tank lets Pythium in. Roots go brown and slimy and the plant wilts.', fix: 'Fix: cool the tank, change to fresh water, add an air stone and cut off the wilted stems.', acts: ['changeRes', 'fan'], hint: 'Water chiller' },
  spidermite: { crop: 'cucumber', title: 'Spider mites', why: 'Hot, dry air is breeding spider mites. Leaves show fine pale stippling and a little webbing.', fix: 'Fix: spray neem oil (again in 5 days), then cool the tent and lift the humidity a touch.', acts: ['spray', 'humidity'], hint: 'Pest spray (ask in store)' },
  mushyfruit: { crop: 'cucumber', title: 'Soft, yellowing fruit tips', why: 'Chilled roots and soggy air are turning the fruit soft and yellow at the tip.', fix: 'Fix: keep nights above 18 °C and the tank above 17 °C, and clear damp air with the fan.', acts: ['lights', 'fan'], hint: 'Heater / heat mat' }
};
// ---- [M-OUT] v37 / METHODS.md section 10: seven problems that only exist outside (S.out). The tent never touches any of this, so the default run stays byte-identical.
// OUTP[id] = { crops, title, see, cause, fix, acts, hint, perth, look: {crop: LOOK_KEY} }; no new look keys, each one reuses an existing plant visual. Accumulators live in S.a.o_<id> (created outside only).
const OUTP = { // [M-OUT]
  snails: { crops: ['lettuce'], title: 'Snails and slugs after the rain', see: 'Ragged holes and slime trails on the outer leaves.', cause: 'A wet spell has the snails and slugs out feeding on soft leaves, mostly at night.', fix: 'Fix: lay snail bait (the Pest control button) and clear dead leaves off the base. A dry few days clears it too.', acts: ['spray', 'prune'], hint: null, perth: 'Perth: worst in a wet June to August week and on the garden bed; pots on a dry veranda are safer.', look: { lettuce: 'slugbite' } },
  caterpillars: { crops: ['lettuce'], title: 'Caterpillars in the heart', see: 'Fresh round holes and green droppings on the leaves.', cause: 'Warm, dry days bring the cabbage moth. Her caterpillars eat the soft leaves.', fix: 'Fix: pick them off by hand (the Pest control button) and check the undersides of the leaves each morning.', acts: ['spray', 'prune'], hint: null, perth: 'Perth: the moths fly from about October on warm days; a few caterpillars return in a warm week, so check again.', look: { lettuce: 'slugbite' } },
  aphidsout: { crops: ['chilli'], title: 'Aphids on a still, warm week', see: 'Clusters of tiny green bugs on the soft tips, and sticky leaves.', cause: 'Warm, still days let aphids breed fast on the new growth. Wind and rain knock them off.', fix: 'Fix: spray neem oil (the Pest control button), and repeat in five days. A breezy day or a shower helps too.', acts: ['spray'], hint: null, perth: 'Perth: a sheltered veranda is still air, so pots there get them first in spring and autumn.', look: { chilli: 'aphid' } },
  sunscald: { crops: ['chilli', 'capsicum'], title: 'Sunscald on the fruit', see: 'Pale, papery, sunken patches on the side of the fruit that faces the sun.', cause: 'A hot, clear afternoon with no shade cooks the skin of the fruit.', fix: 'Fix: put the shade cloth on in the heat. Scarred fruit will not heal, but new fruit stays clean.', acts: ['shade'], hint: null, perth: 'Perth: a 36 degree February afternoon on the garden bed does it; the veranda gets half the sun.', look: { chilli: 'scald', capsicum: 'scald' } },
  frostburn: { crops: ['basil'], title: 'Frost burn', see: 'Black, limp leaf tips that curl, the morning after a very cold night.', cause: 'Basil is tender. A night under about 3 degrees with no cover blackens the tips.', fix: 'Fix: cover the bed or bring the pots in on cold nights. It recovers slowly as the days warm.', acts: ['cover'], hint: null, perth: 'Perth: Byford and the hills dip to 2 or 3 degrees on clear July nights, colder than the coast.', look: { basil: 'cold' } },
  windsnap: { crops: ['tomato'], title: 'Wind damage', see: 'Torn, rolled leaves and bent or snapped stems on the tall plant.', cause: 'A gust over about 35 km/h whips the tall, heavy tomato. The garden bed has no shelter.', fix: 'Fix: prune off the broken bits and tie the plant in. A veranda is sheltered and rarely gets it.', acts: ['prune'], hint: null, perth: 'Perth: a winter cold front or a hot summer easterly can gust past 50 km/h.', look: { tomato: 'curl' } },
  rainsplit: { crops: ['tomato'], title: 'Fruit splitting in the rain', see: 'Splits across the ripe fruit, near the stalk.', cause: 'A heavy rain after a dry spell makes ripe fruit swell faster than the skin can stretch.', fix: 'Fix: pick the ripe fruit before the rain, or bring the pots in out of it.', acts: ['harvest', 'cover'], hint: null, perth: 'Perth: a big autumn or spring downpour on a ripe plant is the usual cause.', look: { tomato: 'crack' } }
};
const OUT_IDS = Object.keys(OUTP); // [M-OUT]
// [M-OUT] hourly accumulators and the def rows for problems(). a = S.a. Every rate is per game hour; a spray (S.immune) stops the pest ones and each one decays on its own.
function outProblems(S, defs, lit, fruitOn) {
  const a = S.a, st = S.stage, T = S.airT, crop = S.cropId, ver = S.method.where === 'veranda', pp = pestPressure(S) / 1.4, wind = S.windNow || 0;
  const rl = S.rainLog, rainRaw = rl[rl.length - 1] || 0, rainH = rainRaw * (ver ? 0.2 : 1), wet24 = rl.reduce((x, y) => x + y, 0) * (ver ? 0.2 : 1);
  if (rl.slice(-6).reduce((x, y) => x + y, 0) * (ver ? 0.2 : 1) >= 6) a.o_bait = 0; else if (a.o_bait > 0) a.o_bait--; // [M-OUT] snail bait lasts 72 h and is washed off by a heavy rain
  const bait = a.o_bait > 0;
  a.o_wet = (a.o_wet || 0) * 0.97 + rainRaw * (ver ? 0.5 : 1); // ground wetness: half life about 23 h; pots under the eaves stay damp underneath
  const up = (k, c, dn) => { a['o_' + k] = Math.max(0, (a['o_' + k] || 0) + c - dn); return a['o_' + k]; };
  const row = (id, v, t1, t2, t3) => { const o = OUTP[id]; defs.push([id, th(v, t1, t2, t3), o.title, o.cause, o.acts.slice(), o.hint]); };
  const has = id => OUTP[id].crops.indexOf(crop) >= 0;
  if (has('snails')) row('snails', up('snails', st >= 1 && !bait && a.o_wet > 8 ? (0.5 + Math.min(1, (a.o_wet - 8) / 12)) * (lit ? 1 : 1.3) * (S.pruneDays > 0 ? 0.6 : 1) : 0, bait ? 0.8 : 0.3), 12, 30, 60);
  if (has('caterpillars')) row('caterpillars', up('caterpillars', st >= 1 && lit && rainH === 0 && T >= 21 && T <= 33 ? (T >= 26 ? 0.55 : 0.35) * pp : 0, 0.1), 14, 36, 72);
  if (has('aphidsout')) row('aphidsout', up('aphidsout', S.pot && st >= 2 && lit && rainH === 0 && T >= 20 && T <= 30 && wind < 12 ? 0.6 * pp : 0, 0.1 + (wind >= 15 ? 0.6 : 0) + (rainH > 0 ? 0.6 : 0)), 8, 24, 48);
  if (has('sunscald')) row('sunscald', up('sunscald', st >= 2 && fruitOn && !S.shade && T >= 32 && S.sunNow >= 1000 ? (T >= 36 ? 2 : 1) : 0, 0.1), 3, 8, 16);
  if (has('frostburn')) row('frostburn', up('frostburn', S.day >= 3 && T < 3 ? 1 + (3 - T) * 1.2 : 0, 0.1 + (T > 10 ? 0.25 : 0)), 2, 6, 12);
  if (has('windsnap')) row('windsnap', up('windsnap', st >= 2 && wind >= 35 ? (wind - 30) / 5 * (S.pruneDays > 0 ? 0.7 : 1) : 0, 0.12), 2, 6, 12);
  if (has('rainsplit')) row('rainsplit', up('rainsplit', st >= 2 && fruitOn && ripeKg(S) > 0.02 && wet24 >= 8 && rainH > 0.3 ? (rainH >= 1 ? 2 : 1) : 0, 0.2), 4, 10, 20);
}
// [M-OUT] the one pest button outside (act 'spray'): does what the active problem needs. Snails: iron-based bait (works over 2 to 3 days, washed off by heavy rain).
// Caterpillars: picked by hand (most go at once, a few return in a warm week). Aphids: neem oil (knocks back about 70 %, repeat in 5 days). Returns false when none of the three is active.
function outPest(S, info) {
  const a = S.a, p = S.pr, did = [];
  if (p.snails) { a.o_snails *= 0.3; a.o_bait = 72; did.push(['Snail bait laid', 'Iron-based bait works over two to three days. Heavy rain washes it off, so lay it again after a downpour.']); }
  if (p.caterpillars) { a.o_caterpillars *= 0.1; did.push(['Caterpillars picked off', 'Hand-picked in the cool of the morning. Most are gone, a few return in a warm week.']); }
  if (p.aphidsout) { ecoSpray(S); a.o_aphidsout *= 0.3; did.push(['Neem oil sprayed', 'Knocks the aphids back by about 70 percent. Spray again in five days.']); }
  if (!did.length) return false;
  did.forEach(d => info(d[0], d[1]));
  return true;
}
// the growth cost of the seven (outside only): a few percent per severity level, folded into probMult
function outMult(S) { const p = S.pr; return (1 - 0.04 * ((p.snails || 0) + (p.caterpillars || 0) + (p.aphidsout || 0)) - 0.04 * (p.sunscald || 0) - 0.06 * (p.frostburn || 0) - 0.05 * (p.windsnap || 0) - 0.04 * (p.rainsplit || 0)); } // [M-OUT]
function problems(S, evs, out, lit, ppfd) {
  const C = CROP_DATA[S.cropId], s = stageOf(S), a = S.a, su = S.setup, st = S.stage, T = S.airT;
  const ecT = ecTotal(S), noMeter = k => !su.meters[k];
  const dec = (k, up, dn) => { a[k] = Math.max(0, a[k] + (up ? up : -dn)); };
  dec('iron', S.ph > C.fe ? 1 : 0, 2);
  dec('ecH', ecT > s.ec[1] + 0.8 ? 1 : 0, 2);
  dec('low', st >= 1 && (S.pot ? S.nutL / potDen(S) : S.nutL / Math.max(S.resL, 0.05)) + 0.15 < s.ec[0] - 0.7 ? 1 : 0, 1);
  if (S.pot) a.wet = Math.max(0, (a.wet || 0) + (S.resL / S.cap > 0.9 ? 1 : -0.5)); // soaked for more than a day => waterlogged roots (soil: root rot pressure, coco: oxygen stress) [M3]
  dec('rot', S.wT > 22 && S.do2 < 6 ? (S.wT > 26 ? 2 : 1) : 0, 1);
  const botIn = (lit && S.rh > 80) || (!lit && S.rh > 95);
  dec('bot', botIn ? (S.pruneDays > 0 ? 0.5 : 1) * (lit ? 1 : 1.5) * (S.out ? 0.6 : 1) : 0, 0.4); // outdoors the wind dries the leaves between showers [M12]
  const hT = C.heatT || 29, cT = coldLim(S, C, C.coldT || 15, 3), cW = coldLim(S, C, C.coldW || 16, 5), PF = C.p || {}, Lh = photoperiod(S);
  dec('heat', st >= 2 && T > hT ? 1 : 0, 0.15);
  // pass 8b (PLAYTEST-DEV-v34 wrong 6): fruit problems need fruit. Blossom end rot fired on day 34 of a chilli with flowers and no fruit set; fruitOn = fruit has actually been set (unpicked mass on the plant) on a fruiting crop.
  const fruitOn = !C.leafy && (S.fruitKg > 0.0005 || ripeKg(S) > 0);
  dec('crack', st === 3 && fruitOn && stageProgress(S) < 0.5 && T > 25 ? 1 : 0, 0.1);
  // [M15] outdoors, chill is also slow: degree-hours below the cold line pile up (nights), drain at 0.5 an hour and take up to 45 % off the growth multiplier. Springs nights barely register; a run of winter nights does. Cover or bringing the pots in stops it.
  if (S.out) a.chill = Math.max(0, (a.chill || 0) + Math.pow(Math.max(0, cT - 1 - T), 2) / 4 - 0.5);
  if (S.out) { // [M16] the clocks behind the outdoor 'grace' on the readings: hours since the air went under its band (a spell ends after 4 warm hours in a row), hours in a row over the humidity band
    const tbN = lit ? s.tempDay : s.tempNight;
    a.warmRun = T >= tbN[0] ? (a.warmRun || 0) + 1 : 0; a.coldRun = T < tbN[0] || ((a.coldRun || 0) > 0 && a.warmRun < 4) ? (a.coldRun || 0) + 1 : 0; a.rhHi = S.rh > s.rh[1] ? (a.rhHi || 0) + 1 : 0;
  }
  dec('cold', T < cT || (S.wT < cW && !(S.out && S.pot)) ? 1 : 0, 1); // outdoor pots follow the air, not a lagged root temperature, so a mild night does not hold the problem on all day [M15]
  // lettuce: tipburn = Ca not reaching the fast-growing heart [S3][S4]: strong solution, thirsty (high VPD) or stagnant air, too much light/heat, wilting, low/high pH
  if (PF.tip) {
    let c = 0;
    if (st >= 2) {
      if (ecT > s.ec[1] + 0.3) c += 0.5;
      if (S.vpd > 1.2) c += 0.4;
      if (lit && S.rh > 85) c += 0.3;
      if (T > s.tempDay[1] + 1) c += 0.3;
      if (lit && ppfd > s.ppfd[1] * 1.25) c += 0.2;
      if (su.fanM3h <= 150) c += 0.25;
      if (S.ph > s.ph[1] + 0.5 || S.ph < 5.2) c += 0.3;
      if (S.wilt > 0.1) c += 0.7;
      if (inertRatio(S) > 0.9) c += 0.3;
    }
    a.tip = Math.max(0, a.tip + c - 0.2);
  }
  // lettuce: bolting from prolonged warmth, worse on long days [S4]
  if (PF.bolt) {
    let b = 0;
    if (st >= 1 && T > C.boltT) b = T > C.boltT + 4 ? 2 : 1;
    if (st >= 1 && Lh > 16 && T > C.boltT - 2) b += 0.5;
    a.bolt = Math.max(0, a.bolt + b - 0.1);
  }
  // basil: downy mildew needs ~85%+ RH, worst near 100% and at night with dew [S5]; hot air (>25C) slows it
  if (PF.dm) {
    let m = 0;
    if ((lit ? S.rh > 85 : S.rh > 90) && T > 8 && T < 28) m = (S.rh > 92 ? 2 : 1) * (lit ? 1 : 1.5) * (S.pruneDays > 0 ? 0.6 : 1) * (T > 25 ? 0.7 : 1) * (S.out ? 0.45 : 1); // outdoors the wind dries the leaves between dews, so it only takes hold in a wet spell [M15]
    a.dm = Math.max(0, a.dm + m - 0.4);
  }
  // cucumber: powdery mildew likes humid, mild (15-21C favoured) air with no airflow [S8][S11]
  if (PF.pm) {
    let m = 0;
    if ((lit ? S.rh > 80 : S.rh > 88) && T > 15 && T < 28) m = (S.rh > 85 ? 1.4 : 0.8) * (T < 22 ? 1.3 : 1) * (S.pruneDays > 0 ? 0.6 : 1);
    a.pm = Math.max(0, a.pm + m - 0.5);
  }
  // cucumber: bitter / misshapen fruit from salt, water and heat stress [S9]
  if (PF.bit) {
    let c = 0;
    if (st >= 2) {
      if (ecT > s.ec[1] + 0.3) c += 0.5;
      if (S.wilt > 0.1) c += 0.7;
      if (T > hT - 1) c += 0.4;
      if (S.vpd > 1.5) c += 0.3;
      if (S.ph > s.ph[1] + 0.5 || S.ph < 5.0) c += 0.2;
    }
    a.bit = Math.max(0, a.bit + c - 0.15);
  }
  // ---- pass 8: crop-specific problems. Each one only exists for the crops that have its flag in CROP_DATA[crop].p, and each is built from state the sim already tracks.
  // Ramps are deliberately wider than the crop's good band, so a grower who holds the stage targets (the harness policy) never sees one at all.
  NEW_KEYS.forEach(k => { if (!(a[k] >= 0)) a[k] = 0; });
  const up = (k, c, dn) => { if (PF[k]) a[k] = Math.max(0, a[k] + c - dn); };
  const lowLight = st >= 2 && S.dliLast > 0 && S.dliLast < s.dli[0] * 0.65; // yesterday's light under 65% of the stage minimum (the Weekly Challenge cheap-light week sits at about 75%, so it stays a plain dim week, not a problem)
  // tomato leaf curl: air over 31C rolls the leaf edges (+1 more over 34C), dry air over 2 kPa on a warm day adds half again. Decays 0.3 an hour.
  up('curl', st >= 1 ? (T > 31 ? 1 : 0) + (T > 34 ? 1 : 0) + (T > 29 && S.vpd > 2 ? 0.6 : 0) : 0, 0.3);
  // capsicum tipburn on young leaves: calcium follows the transpiration stream, so pores shut by dry air (VPD > 1.8 by day) or soggy air (RH > 90 lit / 94 dark),
  // a strong feed (EC > band + 0.5), pH off the band or a wilt all starve the new tips. Decays 0.2 an hour.
  let ct = 0;
  if (st >= 1) {
    if (lit && S.vpd > 1.8) ct += 0.5;
    if (lit ? S.rh > 90 : S.rh > 94) ct += 0.4;
    if (ecT > s.ec[1] + 0.5) ct += 0.4;
    if (S.ph > s.ph[1] + 0.6 || S.ph < 5) ct += 0.3;
    if (S.wilt > 0.1) ct += 0.7;
  }
  up('captip', ct, 0.2);
  // capsicum small fruit from cool nights: dark hours under 16.5C count 1 (under 14C count 2) while the plant is setting fruit; decays 0.25 an hour, so a couple of cold nights show.
  up('smallfruit', st >= 2 && fruitOn && !lit && T < 16.5 ? (T < 14 ? 2 : 1) : 0, 0.25);
  // chilli aphids: they settle on stressed or over-fed soft growth (EC > band + 0.3, a wilt, or air 4C over the day band); worse in still air (fan low) and warmth. A spray protects (S.immune).
  const aphidStress = ecT > s.ec[1] + 0.3 || S.wilt > 0.2 || T > s.tempDay[1] + 4;
  up('aphid', S.immune > 0 || st < 1 || !aphidStress ? 0 : 0.5 + (su.fanM3h <= 150 ? 0.4 : 0) + (T > 20 && T < 32 ? 0.2 : 0), 0.3);
  // chilli thin pale fruit and strawberry small berries: yesterday's light under 65% of the stage minimum while flowering or fruiting. Decays 0.3 an hour.
  up('thinfruit', lowLight && fruitOn ? 1 : 0, 0.3);
  up('smallberry', lowLight && fruitOn ? 1 : 0, 0.3);
  // strawberry grey mould on the fruit: berries sit in damp air (RH > 78 lit / 88 dark) once flowering; worse when cool (< 22C), pruning helps. Decays 0.4 an hour.
  up('greymould', st >= 2 && fruitOn && (lit ? S.rh > 78 : S.rh > 88) ? (S.rh > 90 ? 1.5 : 1) * (T < 22 ? 1.3 : 1) * (S.pruneDays > 0 ? 0.6 : 1) : 0, 0.4);
  // strawberry runners: over 14 h of light after flowering (0.4), plus a feed over the band + 0.1 (0.5), and both together add 0.4. Decays 0.3 an hour.
  const rnLong = st >= 2 && Lh > 14, rnRich = st >= 2 && ecT > s.ec[1] + 0.1;
  up('runners', (rnLong ? 0.4 : 0) + (rnRich ? 0.5 : 0) + (rnLong && rnRich ? 0.4 : 0), 0.3);
  // lettuce slug and snail damage [M-H]: very damp air only (RH > 92 lit / 95 dark; slugs are an outdoor pest, rare in a tent) once the plant has leaves to chew; pruning (airflow) helps. Decays 0.4 an hour.
  up('slugbite', st >= 1 && (lit ? S.rh > 92 : S.rh > 95) ? (S.rh > 96 ? 1.5 : 1) * (S.pruneDays > 0 ? 0.6 : 1) : 0, 0.4);
  // lettuce warm-tank root trouble: tank water over 25.5C (over 28C counts double), with an oxygen shortfall (under 6.5 mg/L) adding half. Decays 0.3 an hour.
  up('rootrot', S.wT > 25.5 ? (S.wT > 28 ? 2 : 1) + (S.do2 < 6.5 ? 0.5 : 0) : 0, 0.3);
  // basil fusarium wilt: warm tank (over 27C, over 30C counts double), low oxygen adds half. Decays 0.3 an hour.
  up('fusarium', st >= 1 && S.wT > 27 ? (S.wT > 30 ? 2 : 1) + (S.do2 < 6.5 ? 0.5 : 0) : 0, 0.3);
  // cucumber spider mites: a sustained hot (> 29C) and dry (VPD > 1.8, RH under 45 adds more) spell; a spray protects. Decays 0.5 an hour.
  up('spidermite', S.immune > 0 || st < 1 ? 0 : (T > 29 ? 0.6 : 0) + (S.vpd > 1.8 ? 0.8 : 0) + (S.rh < 45 ? 0.4 : 0), 0.5);
  // cucumber soft, yellowing fruit tip while fruiting: chilled air (< 16.5C) or tank (< 16C), and soggy air (RH > 94) adds more. Decays 0.3 an hour.
  up('mushyfruit', st >= 3 && fruitOn ? (T < 16.5 ? 1 : 0) + (S.wT < 16 ? 0.5 : 0) + (S.rh > 94 ? 0.6 : 0) : 0, 0.3);
  dec('dryHot', T > 27 && S.rh < 50 ? 1 : 0, 0.3);
  dec('dryAir', S.vpd > (S.out ? 2.2 : 1.5) ? 1 : 0, 1);
  if (st >= 2 && fruitOn) {
    let c = 0;
    if (ecT > s.ec[1] + 0.3) c += 0.5;
    if (lit && S.rh > 88) c += 0.3;
    if (S.ph > s.ph[1] + 0.5 || S.ph < 5) c += 0.3;
    if (S.wilt > 0.1) c += 0.7;
    if (S.vpd > 1.8) c += 0.2;
    if (inertRatio(S) > 0.9) c += 0.3;
    a.ber = Math.max(0, a.ber + c - 0.12);
  } else a.ber = Math.max(0, a.ber - 0.12);
  const ph = S.ph, mp = noMeter('ph'), me = noMeter('ec'), mt = noMeter('thermo');
  // the humidity button cycles off -> humidify -> dehumidify, so never point at it when the right mode is already running
  const dampFix = su.humMode === 'dehumidify' ? ['fan', 'prune'] : su.humMode === 'humidify' ? ['humidity', 'fan', 'prune'] : ['fan', 'prune'];
  const defs = [
    ['iron', th(a.iron, 6, 24, 72), 'Iron lockout', (mp ? 'The pH has drifted up, so' : 'pH is above ' + C.fe + ' so') + ' roots cannot take up iron. New leaves go yellow with green veins.', /* v55 (round 8 #4): no pH figure for a player without a pH meter */ ['phDown', 'changeRes'], mp ? 'pH meter' : 'pH Down'],
    ['phlow', ph < 4.4 ? 3 : ph < 4.8 ? 2 : ph < 5.2 ? 1 : 0, 'pH too low', 'Acidic solution damages roots and locks out calcium and magnesium.', ['phUp', 'changeRes'], mp ? 'pH meter' : 'pH Up'],
    ['ecburn', th(a.ecH, 6, 24, 60), 'EC burn', 'Solution is too strong. Leaf tips are scorching and roots struggle to drink.', ['topUp', 'changeRes'], me ? 'EC meter' : 'Fresh water / Reservoir'],
    ['lowec', th(a.low, 12, 36, 72), 'Hungry plants', 'Nutrient strength is too low for this stage. Growth is stalling and leaves pale.', ['mix'], me ? 'EC meter' : 'Nutrient line'],
    ['rot', th(a.rot, 24, 48, 96), 'Root rot risk', 'Warm solution with low oxygen is breeding Pythium. Roots turn brown and slimy.', ['changeRes'], su.airPump ? 'Water chiller' : 'Air pump'],
    ['botrytis', th(a.bot, 12, 30, 60), 'Grey mould (botrytis)', 'Air is too humid for too long. Grey fuzzy mould is starting on leaves and stems.', dampFix, su.humMode === 'dehumidify' ? 'Fan' : 'Dehumidifier'],
    ['heat', th(a.heat, 4, 10, 20), 'Heat: flowers dropping', 'Air above ' + hT + 'C is killing pollen and flowers are falling off.', ['fan', 'lights'], su.fanM3h >= 450 ? 'Fan' : 'Fan speed controller'],
    ['crack', th(a.crack, 15, 40, 80), 'Fruit cracking', 'Uneven watering is splitting the skins: the plant drinks in gulps and the fruit swells in fits.', ['topUp'], 'Reservoir'], // [M-H]
    ['cold', th(a.cold, 6, 18, 40), 'Cold stall', 'It is too cold (air below ' + cT + 'C or solution below ' + cW + 'C). Growth and ' + (C.leafy ? 'leaf quality have' : 'fruit set have') + ' stalled.', ['lights'], mt ? 'Heater / heat mat' : 'Thermo-hygrometer'],
    ['dryair', th(a.dryAir, 6, 18, 36), 'Air too dry', 'The air is very dry (high VPD, how thirsty the air is). Plants close their pores and stop growing; leaf edges crisp.', su.humMode === 'humidify' ? ['fan'] : ['humidity', 'fan'], su.humMode === 'humidify' ? 'Fan speed controller' : 'Humidifier'],
    ['ber', th(a.ber, 8, 20, 40), 'Blossom end rot', 'Fruit bottoms are going sunken and black. Calcium is not reaching the fruit (high EC, humidity swings, pH or drought).', ['changeRes', 'phDown'], 'Cal-Mag supplement'],
    ['wilt', S.wilt > 0.8 ? 3 : S.wilt > 0.5 ? 2 : S.wilt > 0.2 ? 1 : 0, S.pot ? 'Wilting: pots dry' : 'Wilting: tank empty', S.pot ? 'The pots have run dry and the plants are wilting. Tap Water.' : 'The reservoir has run dry and the plants are wilting. Tap Top up.', S.pot ? ['water'] : ['topUp'], S.pot ? '' : 'Auto top-up kit'], /* v51: pots have no tank (critic round 5) */
    ['lowwater', S.resL < 0.2 * S.cap && S.wilt <= 0.2 ? 1 : 0, S.pot ? 'Pots drying out' : 'Tank running low', S.pot ? 'The pots are nearly dry. Water before the plants wilt.' : 'Less than 20% of the tank is left. Top up before plants go dry.', S.pot ? ['water'] : ['topUp'], S.pot ? '' : 'Larger reservoir'], /* v49b: pots have no tank */
    ['tip', th(a.tip, 8, 20, 40), 'Tipburn', 'Leaf edges in the centre of the head are going brown and crisp. Calcium is not reaching the fast-growing heart (strong feed, thirsty air, too much light, stale air or pH off).', ['fan', 'changeRes', 'lights'], 'Cal-Mag supplement'],
    ['bolt', th(a.bolt, 30, 90, 160), 'Bolting', 'Warm days (above ' + C.boltT + 'C) and long light hours are pushing the lettuce to bolt: a tall flower stalk and bitter leaves.', ['fan', 'lights'], 'Chiller'],
    ['dm', th(a.dm, 10, 30, 60), 'Downy mildew', 'Humidity has sat above 85% so spores are spreading. Yellow patches show on top of leaves with grey fuzz underneath.', dampFix, su.humMode === 'dehumidify' ? 'Fan' : 'Dehumidifier'],
    ['pm', th(a.pm, 12, 30, 60), 'Powdery mildew', 'White powder is spreading over the cucumber leaves. It likes humid, mild, still air; the leaves need not be wet.', dampFix.concat('spray'), su.humMode === 'dehumidify' ? 'Fan' : 'Dehumidifier'],
    ['bit', th(a.bit, 8, 20, 40), 'Bitter, misshapen fruit', 'Strong feed, drought or heat is stressing the vine, so fruit are going bitter and curled or pinched.', ['topUp', 'changeRes', 'fan'], me ? 'EC meter' : 'Fresh water / Reservoir'],
    ['curl', th(a.curl, 6, 16, 32)], ['captip', th(a.captip, 10, 24, 48)], ['smallfruit', th(a.smallfruit, 8, 24, 48)], ['aphid', th(a.aphid, 8, 20, 40)],
    ['thinfruit', th(a.thinfruit, 30, 70, 120)], ['greymould', th(a.greymould, 12, 30, 60)], ['runners', th(a.runners, 20, 50, 100)], ['smallberry', th(a.smallberry, 30, 70, 120)],
    ['slugbite', th(a.slugbite, 10, 30, 60)], ['rootrot', th(a.rootrot, 10, 30, 60)], ['fusarium', th(a.fusarium, 10, 30, 60)], ['spidermite', th(a.spidermite, 14, 40, 80)], ['mushyfruit', th(a.mushyfruit, 8, 24, 48)],
    ['pests', S.pestLevel < 0.5 ? 0 : S.pestLevel < 1.5 ? 1 : S.pestLevel < 2.5 ? 2 : 3, 'Pests', 'Spider mites and thrips are booming in the hot, dry air. Leaves are stippled with fine webbing. Tap ' + (S.out ? 'Pest control' : 'Spray') + ' now, and again in 5 days.', ['spray'], 'Pest spray (ask in store)'] /* v69 (play-test #20 m6): the card names the button, not only the shop */
  ];
  if (S.out) outProblems(S, defs, lit, fruitOn); // [M-OUT]
  if (!isLegacy(S)) methodDefs(S, defs);
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i], id = d[0], sev = d[1], prev = S.pr[id] || 0;
    if (NEWP[id] && d.length < 6) { const n = NEWP[id]; d[2] = n.title; d[3] = n.why; d[4] = id === 'greymould' ? dampFix : id === 'slugbite' ? ['prune', 'fan', 'spray'] : n.acts; d[5] = id === 'rootrot' || id === 'fusarium' ? (su.airPump ? 'Water chiller' : 'Air pump') : id === 'greymould' || id === 'slugbite' ? (su.humMode === 'dehumidify' ? 'Fan' : 'Dehumidifier') : n.hint; }
    if (NEWP[id] && S.out) d[4] = mapFix(S, id, d[4]); // the tent buttons in the card table become outdoor levers [M15]
    if (GATED[id] && !PF[id]) continue; // problem types this crop does not have
    if (sev > prev) { const e = ev('problem', id, d[2], d[3], sev, d[4], d[5]); if (S.out && id === 'cold') e.productHint = null; evs.push(e); }
    else if (sev === 0 && prev >= 2) evs.push(ev('info', id + '_ok', d[2] + ' resolved', 'Looks like that problem has eased off.', 0, [], ''));
    if (sev === 0) delete S.pr[id]; else S.pr[id] = sev;
  }
  // Pests: spawn probability climbs in hot dry spells
  if (S.immune <= 0 && S.pestLevel === 0 && rand(S) < (a.dryHot >= 30 ? 0.01 : 0.0002) * pestPressure(S)) S.pestLevel = 0.6; // pest pressure: garden x2, veranda x1.4, tent x1 [M14]
}

// ---------------------------------------------------------------------------
// Daily rollover: growth, fruit, meter drift, weather, pests
// ---------------------------------------------------------------------------
function growBlock(S, evs) {
  const C = CROP_DATA[S.cropId], s = stageOf(S), dli = S.acc.dli;
  const lo = s.dli[0] * 0.9, hi = s.dli[1] * 1.3;
  const fD = dli < lo ? dli / lo : dli <= hi ? 1 : Math.max(0.7, 1 - 0.15 * (dli - hi) / hi);
  const g = S.acc.w > 0 ? S.acc.sum / S.acc.w : 0, pm = probMult(S);
  S.dliLast = dli; S.dayG = g * fD * pm;
  if (!S.cropDone) S.bio += s.gmax * fD * g * pm;
  S.leaf = 0.9 * (1 - Math.exp(-S.bio / (C.leafK || 120)));
  let gain = 0;
  const sp = stageProgress(S), nS = C.stages.length, fs = C.fruitStage === undefined ? 3 : C.fruitStage;
  // harvestable mass (fruit, or leaf for leafy crops) is made from stage fruitStage on; fruit crops stop setting new fruit late in the last stage
  if (!S.mature && !S.cropDone && S.stage >= fs && (C.accrueEnd || S.stage < nS - 1 || sp < 0.85)) {
    const ramp = S.stage > fs ? 1 : Math.min(1, 0.35 + 2.6 * sp);
    const standF = C.standCap ? Math.max(0, 1 - S.fruitKg / (C.standCap * S.nplants * towerX(S))) : 1; /* [M-TOW] */ // cut-and-come-again: regrowth slows as the stand refills
    const flowerF = C.harvest === 'cut' && S.stage === nS - 1 && S.day - S.lastCut > 8 ? 0.6 : 1; // uncut basil bolts to flower and leaf growth stalls
    gain = C.gf * fD * g * Math.min(1, S.leaf / 0.45) * ramp * setMult(S) * pm * S.nplants * towerX(S) * standF * flowerF; // [M-TOW]
    S.fruitKg += gain;
  }
  const hl = C.ripeDays === undefined ? 7 : C.ripeDays; // fruit takes ~7 game days to ripen; leaf is pickable at once
  if (hl > 0) { S.hist.push(gain); while (S.hist.length > hl) S.hist.shift(); } else S.hist = [];
  if (S.mature) S.hist = [];
  const ripe = ripeKg(S), nn = C.noun || 'fruit';
  if (ripe > (C.alertPer || 0.35) * S.nplants * towerX(S) && /* [M-TOW] */ S.day - S.ripeAlert >= 6 && !S.mature && !S.cropDone) {
    S.ripeAlert = S.day;
    evs.push(ev('harvest', 'ripe', C.leafy ? 'Ready to pick' : 'Fruit ready', C.leafy ? r2(ripe) + ' kg of ' + nn + ' ' + (C.harvest === 'cut' ? 'can be cut now. Basil keeps two thirds and regrows.' : 'are big enough to pick, but they keep filling for a few more days. Picking ends the crop.') : r2(ripe) + ' kg of fruit is ripe. Pick it to keep the plant producing.', 0, ['harvest'], ''));
  }
}
function dayEnd(S, evs) {
  ecoDay(S); // [M33]
  if (S.slots) { // tower: every plant grows on its own clock
    S.slots.forEach(sl => { if (live(sl)) { sl.acc.dli = S.acc.dli; const e2 = []; inSlot(S, sl, () => growBlock(S, e2)); pushUniq(evs, e2); } });
    syncAgg(S);
  } else growBlock(S, evs);
  // meters drift, pests grow, protection / prune timers
  S.drift.ph = clamp(S.drift.ph + (rand(S) - 0.5) * 0.06, -0.6, 0.6);
  S.drift.ec = clamp(S.drift.ec + (rand(S) - 0.5) * 0.08, -0.4, 0.4);
  if (S.slots) towerPestDay(S); else if (S.pestLevel > 0) S.pestLevel = Math.min(3, S.pestLevel * 1.3 + 0.1);
  if (S.immune > 0) S.immune--;
  if (S.pruneDays > 0) S.pruneDays--;
  if (S.pruneCool > 0) S.pruneCool--;
  S.acc = { sum: 0, w: 0, dli: 0 };
  S.day++;
  newDayWeather(S);
  if (S.wx.hwStart) evs.push(S.out ? ev('info', 'heatwave', 'Heatwave coming', 'Hot weather for the next few days. Shade cloth on in the heat of the day, and water early.', 1, ['shade'], '') : ev('info', 'heatwave', 'Heatwave coming', 'Hot weather outside for the next few days. Watch your tent temperature.', 1, ['fan', 'lights'], 'Fan speed controller')); /* v49b: a bed has no tent */
}
function ripeKg(S) { if (S.slots && !IN_SLOT) return S.slots.reduce((a, x) => a + (live(x) ? slotRipe(x) : 0), 0); let sum = 0; for (let i = 0; i < S.hist.length; i++) sum += S.hist[i]; return Math.max(0, S.fruitKg - sum); }


// ---------------------------------------------------------------------------
// Grow-method API: which actions, tiles and gear belong to this grow (docs/METHODS.md)
// ---------------------------------------------------------------------------
const CLIMATE_ACTS = ['lights', 'fan', 'humidity'];
const NEWACT = { water: 1, feed: 1, drip: 1, shade: 1, cover: 1, plant: 1 };
const ACTIONS_EXTRA = [
  { id: 'water', label: 'Water', params: [], desc: 'Plain water until the root zone is full (soil: to field capacity; coco: a plain flush that also washes salts out).' },
  { id: 'feed', label: 'Feed', params: ['mlPerL'], desc: 'Soil: a liquid feed drench into the soil store (too strong burns). Coco: water with feed at your mix EC and pH, with some run-off.' },
  { id: 'drip', label: 'Drip feed', params: ['on', 'mlPerL'], desc: 'Coco only. A timer tops the pots up with feed every 4 hours of daylight. Uses a kit and a little power.' },
  { id: 'shade', label: 'Shade cloth', params: ['on'], desc: 'Outdoors and veranda. Shade cloth cuts the light about 30% and takes 2.5 C off the air while the sun is out. On or off.' },
  { id: 'cover', label: 'Cover', params: ['on'], desc: 'Outdoors and veranda, for cold nights. Garden bed: frost cloth keeps the night air 3 C warmer (and cuts the day light 15% if left on). Veranda: bring the pots inside, 6 C warmer at night but no sun, so put them back out in the morning. On or off.' },
  { id: 'plant', label: 'Plant', params: [], desc: 'Tower only. Put a seedling in the next empty slot. Stagger your planting so the tower never all ripens at once.' }
];
function methodOf(S) { return S.method || { where: 'tent', how: 'hydro' }; }
function isLegacy(S) { const m = methodOf(S); return m.where === 'tent' && m.how === 'hydro'; }
function actionsFor(S) {
  const m = methodOf(S), tent = m.where === 'tent', clim = tent ? CLIMATE_ACTS : [], sh = tent ? [] : ['shade', 'cover'];
  if (m.how === 'soil') return ['water', 'feed'].concat(clim, sh, ['prune', 'spray', 'harvest', 'ask']);
  if (m.how === 'coco') return ['feed', 'water', 'phDown', 'phUp', 'drip'].concat(clim, sh, ['prune', 'spray', 'harvest', 'ask']);
  const mt = (S.setup && S.setup.meters) || null, base = ACTIONS.map(a => a.id).filter(id => (tent || CLIMATE_ACTS.indexOf(id) < 0) && !(id === 'calibrate' && mt && !mt.ph && !mt.ec)); /* v55 (round 8 #4): no pH cal button without a pH or EC meter */
  if (m.how === 'tower') { const i = base.indexOf('changeRes') + 1; return base.slice(0, i).concat(['plant'], sh, base.slice(i), ['ask']); }
  return base.concat(['ask']);
}
// The reading keys the UI should tile for this grow, most useful first. Hydro tub = the list the UI has always shown.
function tilesFor(S) {
  const m = methodOf(S), tent = m.where === 'tent', ver = m.where === 'veranda';
  if (m.how === 'hydro') return ['ec', 'ph', 'airTemp', 'rh', 'vpd', 'reservoirL', 'waterTemp', 'ppfd', 'dli'];
  if (m.how === 'tower') return tent ? ['ec', 'ph', 'reservoirL', 'airTemp', 'rh', 'vpd', 'waterTemp', 'ppfd', 'dli'] : ['ec', 'ph', 'reservoirL', 'airTemp', 'shade', 'waterTemp', 'rh', 'ppfd', 'dli'];
  const wx = tent ? [] : ['rain'].concat(ver ? [] : ['wind'], ['shade']);
  if (m.how === 'soil') return tent ? ['moisture', 'airTemp', 'rh', 'vpd', 'ph', 'ppfd', 'dli'] : ['moisture', 'airTemp'].concat(wx, ['ph', 'rh', 'ppfd', 'dli']);
  return tent ? ['moisture', 'ec', 'ph', 'airTemp', 'rh', 'vpd', 'ppfd', 'dli'] : ['moisture', 'ec', 'ph', 'airTemp'].concat(wx, ['rh', 'ppfd', 'dli']);
}
// ---------------------------------------------------------------------------
// whyRed [M16]: the plain-English "why is this tile off and what do I do" for any reading key, in every grow.
// Sim.whyRed(S, key) -> { title, line, fix }. title = the tile's plain name, line = one short sentence with the number and the cause (under 110 characters),
// fix = the id of the action that helps (always one of actionsFor(S)) or null when the line says to wait it out. Good tiles say "In the green.".
// ---------------------------------------------------------------------------
const WHY_CROP = { tomato: 'tomato', capsicum: 'capsicum', chilli: 'chilli', strawberry: 'strawberry', lettuce: 'lettuce', basil: 'basil', cucumber: 'cucumber' };
const WHY_TITLE = { moisture: 'Soil', rain: 'Rain', wind: 'Wind', shade: 'Shade', cover: 'Cover', ec: 'EC', ph: 'pH', airTemp: 'Air', rh: 'Humidity', vpd: 'VPD', ppfd: 'Light', dli: 'Light per day (DLI)', waterTemp: 'Water', reservoirL: 'Tank', do2: 'Oxygen' }; // [M-x] v44
// [M-OUT] whyRed lines for the seven outdoor problems: [line, fix id or null], or null when none is active on this tile
function outWhy(S, key, n0, pick) {
  const p = S.pr || {}, cv = S.cover ? null : pick('cover'), sh = S.shade ? null : pick('shade');
  if (key === 'rain' && p.snails) return ['Rain has the ground wet: snails are chewing the leaves. Spray.', pick('spray')];
  if (key === 'rain' && p.rainsplit) return ['Heavy rain is splitting the ripe fruit. Pick it now.', pick('harvest')];
  if (key === 'wind' && p.windsnap) return ['Wind ' + n0(S.windNow || 0) + ' km/h: gusts tore the plant. Prune the broken bits.', pick('prune')];
  if (key === 'airTemp' && p.frostburn) return [S.cover ? 'Frost burned the tips. It is covered now and will recover as the days warm.' : 'Air ' + n0(S.airT) + ' °C: frost burned the tips. Cover it on cold nights.', cv];
  if ((key === 'airTemp' || key === 'ppfd') && p.sunscald) return [S.shade ? 'Hot sun scalded the fruit. The shade is on, so new fruit stays clean.' : 'Hot sun is scalding the fruit. Put the shade on.', sh];
  return null;
}
function whyRed(S, key) {
  const r = readings(S), m = methodOf(S), out = !!S.out, pot = !!S.pot, soil = m.how === 'soil', acts = actionsFor(S);
  const C = CROP_DATA[S.cropId], crop = WHY_CROP[S.cropId] || 'plant', tg = r.targets || {}, st = (r.status || {})[key];
  const n0 = x => String(Math.round(x)), pick = id => (acts.indexOf(id) >= 0 ? id : null);
  let title = WHY_TITLE[key] || String(key);
  if (key === 'moisture' && m.how === 'coco') title = 'Coco';
  const done = (line, fix) => ({ title: title, line: line.length > 109 ? line.slice(0, 108).replace(/[ ,;:]+\S*$/, '') + '.' : line, fix: fix || null });
  if (!WHY_TITLE[key]) return done('Not a reading on this grow.', null);
  if (out) { const ow = outWhy(S, key, n0, pick); if (ow) return done(ow[0], ow[1]); } // [M-OUT] an outdoor problem names its fix on the tile that caused it
  if (st === undefined || st === 'unknown') {
    if (key === 'vpd' && out) return done('Not rated outside: the weather sets the dryness of the air.', null);
    if (key === 'moisture') return done('No pot to measure on this grow.', null);
    if (key === 'reservoirL' && pot) return done('No tank on this grow: the pots hold the water.', null);
    if (key === 'rain' || key === 'wind' || key === 'shade' || key === 'cover') return done('Only the veranda and garden have this one.', null);
    return done('No meter on this one, so nothing to read yet.', null);
  }
  if (st === 'good') return done('In the green.', null);
  const v = r[key], t = tg[key] || [0, 0], low = Array.isArray(t) && v < t[0], hi = Array.isArray(t) && v > t[1];
  const lit = !!S.lit, tb = tg.airTemp || [0, 0];
  switch (key) {
    case 'moisture': {
      const pc = n0(v * 100) + '%', what = m.how === 'coco' ? 'Coco' : 'Soil';
      if (low) return done(what + ' ' + pc + ': dry, and plants wilt under 30%. Give it a drink.', pick('water'));
      return done(what + ' ' + pc + ': too wet. Skip the next water, the roots need air.', null); // [M-x] v45 one wording everywhere (Axel's line, Why orange, the Health note)
    }
    case 'ec': {
      if (low) return done('EC ' + r2(v, 1) + ': too weak for ' + crop + ' now, it wants ' + r2(t[0], 1) + ' to ' + r2(t[1], 1) + '. Feed it.', pick(pot ? 'feed' : 'mix'));
      return done('EC ' + r2(v, 1) + ': too strong, it burns the tips. Water it down.', pick(pot ? 'water' : 'topUp'));
    }
    case 'ph': {
      if (soil) return done('pH ' + r2(v, 1) + ': soil holds pH steady. Give it time and a good water.', pick('water'));
      return done('pH ' + r2(v, 1) + (low ? ': pH low, the roots cannot feed. Add pH up.' : ': pH high, iron locks up. Add pH down.'), pick(low ? 'phUp' : 'phDown')); // [M-x] v44
    }
    case 'airTemp': {
      const t0 = n0(v), bT = C.baseT === undefined ? 10 : C.baseT, band = n0(tb[0]) + ' to ' + n0(tb[1]);
      if (out) {
        if (low) {
          if (S.cover) return done('Air ' + t0 + ' °C: still cold under cover. Wait it out: the sun is coming.', null);
          return done('Air ' + t0 + ' °C: ' + (v < bT ? 'cold ' + (lit ? 'day' : 'night') + ' for ' + crop + ', below ' + n0(bT) + ' °C it sulks.' : 'cool for ' + crop + ', it wants ' + band + ' °C.'), pick('cover'));
        }
        if (S.shade) return done('Air ' + t0 + ' °C: hot even with shade on. Wait it out: it cools tonight.', null);
        return done('Air ' + t0 + ' °C: hot for ' + crop + ', over ' + n0(tb[1]) + ' °C it struggles. Shade it.', pick('shade'));
      }
      return done('Air ' + t0 + ' °C: ' + (low ? 'too cool' : 'too hot') + ' for ' + crop + ', it wants ' + band + ' °C. ' + (low ? 'Slow the fan.' : 'More fan.'), pick('fan'));
    }
    case 'rh': {
      const p = n0(v) + '%';
      if (out) return S.stage < 1 ? done('Humidity ' + p + ': damp for a day, mould likes it. It is the weather, so give it time.', null) : done('Humidity ' + p + ': damp for a day, mould likes it. Prune for airflow.', pick('prune')); /* v66 (critic round 15 m3): a seedling cannot be pruned */
      if (hi) return done('Humidity ' + p + ': too damp for ' + crop + ', mould likes it. Run the fan.', pick('fan'));
      return done('Humidity ' + p + ': too dry for ' + crop + '. Turn the Mist on.', pick('humidity'));
    }
    case 'vpd': {
      if (out) return done('Not rated outside: the weather sets the dryness of the air.', null);
      return hi ? done('VPD ' + r2(v, 1) + ' kPa: the air is thirsty, so the stomata close. Add humidity.', pick('humidity')) : done('VPD ' + r2(v, 1) + ' kPa: the air is too damp for it to drink. Run the fan.', pick('fan'));
    }
    case 'reservoirL': {
      if (pot) return done('No tank on this grow: the pots hold the water.', null);
      return done('Tank ' + r2(v, 1) + ' L: nearly empty, it drinks fast in the warm. Top it up.', pick('topUp'));
    }
    case 'waterTemp': {
      if (pot) return done('Roots follow the air here. Check the Air tile.', null);
      if (hi) return done('Water ' + n0(v) + ' °C: warm, roots rot and slime up. Change the tank.', pick('changeRes'));
      return done('Water ' + n0(v) + ' °C: cold, the roots slow down. Wait it out: it warms with the day.', null);
    }
    case 'ppfd': {
      if (out) return done('Light ' + n0(v) + ': harsh sun on a hot day. Put the shade cloth on.', S.shade ? null : pick('shade'));
      return done('Light ' + n0(v) + ': ' + (low ? 'too dim for ' + crop + '. Lift the dimmer or add hours.' : 'too bright for ' + crop + '. Dim the lights.'), pick('lights'));
    }
    case 'dli': {
      if (out) return done('Daily light (DLI) ' + r2(v, 0) + ' mol on a hot day: more sun than ' + crop + ' wants. Shade it a bit.', S.shade ? null : pick('shade')); // [M-x] v44
      return done('Daily light (DLI) ' + r2(v, 0) + ' mol a day: ' + (low ? 'too little for ' + crop + '. Add lighting hours.' : 'too much for ' + crop + '. Cut the hours.'), pick('lights')); // [M-x] v44
    }
    case 'rain': return done('Rain ' + n0(v) + ' mm in a day: pots are soaked. Skip the water and wait it out.', null);
    case 'wind': return done('Wind ' + n0(v) + ' km/h: it dries the pots fast. Check the water.', pot && r.moisture !== null && r.moisture < (m.how === 'coco' ? 0.7 : 0.65) ? pick('water') : null);
    case 'do2': return done('Oxygen ' + r2(v, 1) + ' mg/L: the roots are short of air. Fresh water helps.', pick(pot ? 'water' : 'changeRes'));
    default: return done('Wait it out: the weather will shift.', null);
  }
}

const GEAR_NOTE = {
  tent: 'The enclosed space your plants grew in.', light: 'The light on its timer, hour by hour.', nutrients: 'The feed you mixed in.',
  medium: 'Coco coir that drains fast and holds air.', air: 'Oxygen for the roots in the tank.', testing: 'EC, pH and temperature readings.', additives: 'pH Down, pH Up and Cal-Mag to keep things in range.',
  soil: 'Potting mix that holds water and feed for the roots.', pots: 'Pots with saucers so the roots can drain.', drip: 'A drip kit and timer to feed the pots while you are out.',
  tower: 'A hydro tower with a slot for each plant.', shade: 'Shade cloth to cut the sun and heat on hot days.', pump: 'A water pump to run the tower.'
};
// Ordered gear category ids for a grow, with a one-line note each. The shop panel maps these to rows and prices (shop.js Shop.gearFor).
function gearFor(where, how) {
  const tent = where === 'tent', n = id => ({ id: id, note: GEAR_NOTE[id] });
  let ids;
  if (how === 'soil') ids = tent ? ['tent', 'light', 'soil', 'pots', 'nutrients', 'testing', 'additives'] : where === 'veranda' ? ['pots', 'soil', 'nutrients', 'shade', 'additives'] : ['soil', 'nutrients', 'shade', 'additives'];
  else if (how === 'coco') ids = tent ? ['tent', 'light', 'medium', 'pots', 'nutrients', 'drip', 'testing', 'additives'] : ['pots', 'medium', 'nutrients', 'drip', 'shade', 'testing', 'additives'];
  else if (how === 'tower') ids = tent ? ['tent', 'light', 'tower', 'pump', 'nutrients', 'air', 'testing', 'additives'] : ['tower', 'pump', 'nutrients', 'shade', 'testing', 'additives'];
  else ids = ['tent', 'light', 'nutrients', 'medium', 'air', 'testing', 'additives'];
  return ids.map(n);
}

// ---- tower pests: a pest outbreak starts in one slot and spreads to its neighbours [M13] ----
function towerPest(S) {
  const lv = S.slots.filter(live); if (!lv.length) return;
  if (S.pestLevel > 0 && lv.every(x => !(x.pest > 0))) lv[Math.floor(rand(S) * lv.length)].pest = Math.min(3, 0.6 * lv.length);
  S.pestLevel = lv.reduce((a, x) => a + x.pest, 0) / lv.length;
}
function towerPestDay(S) {
  const sl = S.slots, before = sl.map(x => live(x) ? x.pest : 0);
  sl.forEach(x => { if (live(x) && x.pest > 0) x.pest = Math.min(3, x.pest * 1.3 + 0.1); });
  sl.forEach((x, i) => { if (live(x) && !(x.pest > 0) && ((i > 0 && before[i - 1] >= 1) || (i < sl.length - 1 && before[i + 1] >= 1))) x.pest = 0.3; });
  const lv = sl.filter(live); S.pestLevel = lv.length ? lv.reduce((a, x) => a + x.pest, 0) / lv.length : 0;
}

// ---- problem cards for the new grows: re-word the tank-based ones and point the fix buttons at actions that exist here ----
function mapFix(S, id, arr) {
  let out = (arr || []).slice();
  const pot = S.pot, soil = pot && S.method.how === 'soil';
  out = out.map(a => pot && (a === 'topUp' || a === 'changeRes') ? 'water' : pot && a === 'mix' ? 'feed' : a);
  if (soil) out = out.filter(a => a !== 'phDown' && a !== 'phUp' && a !== 'calibrate');
  if (S.out) {
    const had = out.some(a => CLIMATE_ACTS.indexOf(a) >= 0);
    out = out.filter(a => CLIMATE_ACTS.indexOf(a) < 0);
    if (id === 'crack' && !S.cover) out.push('cover'); // [M-H] splitting is water and rain, not heat
    if (had && !S.shade && { heat: 1, curl: 1, bolt: 1, dryair: 1, tip: 1, spidermite: 1 }[id]) out.push('shade');
    if (had && !S.cover && { smallfruit: 1, mushyfruit: 1, cold: 1 }[id]) out.push('cover');
  }
  return out.filter((a, i) => out.indexOf(a) === i);
}
function methodDefs(S, defs) {
  const byId = {}; defs.forEach(d => { byId[d[0]] = d; });
  const how = S.method.how, pot = S.pot;
  if (pot) {
    const m = S.resL / S.cap, soil = how === 'soil', medium = soil ? 'soil' : 'coco';
    byId.wilt[2] = 'Wilting: root zone dry'; byId.wilt[3] = 'The ' + medium + ' has dried out and the plants are wilting. Tap Water.'; /* v71: names the button, as every other fix line does */ byId.wilt[4] = soil ? ['water'] : ['water', 'feed']; byId.wilt[5] = 'Drip kit and timer';
    byId.lowwater[1] = m < 0.4 && S.wilt <= 0.2 ? 1 : 0; byId.lowwater[2] = 'Getting dry'; byId.lowwater[3] = 'The ' + medium + ' is under 40% moisture. Water before the plants wilt.'; byId.lowwater[4] = ['water']; byId.lowwater[5] = 'Drip kit and timer';
    byId.rot[3] = 'Warm, wet roots with little air are breeding root rot. Let it drain and water less.'; byId.rot[4] = []; byId.rot[5] = 'Pots and saucers';
    byId.ecburn[3] = soil ? 'The soil is carrying too much feed. Tips are scorching and roots struggle.' : 'The coco has built up salt. Tips are scorching and roots struggle to drink.'; byId.ecburn[4] = ['water']; byId.ecburn[5] = 'Fresh water';
    byId.lowec[3] = 'The ' + medium + ' is short of feed for this stage. Growth is stalling and leaves pale.'; byId.lowec[4] = ['feed']; byId.lowec[5] = 'Nutrient line';
    defs.push(['soggy', th(S.a.wet || 0, 24, 48, 96), soil ? 'Waterlogged: root rot risk' : 'Waterlogged: roots short of air', 'The ' + medium + ' has stayed soaked for over a day. Roots need air as well as water. Skip the next watering and let it drain.', [], 'Pots and saucers']);
  }
  defs.forEach(d => { d[4] = mapFix(S, d[0], d[4]); });
  if (S.out && byId.cold) { // the tent's cold stall is a cold night outside: the lever is Cover, there is no product to buy [M15]
    const ver = S.method.where === 'veranda';
    byId.cold[2] = 'Cold night'; byId.cold[3] = ver ? 'The pots are too cold. Bring them in.' : 'The bed is too cold at night. Cover the bed.'; byId.cold[4] = S.cover ? [] : ['cover']; byId.cold[5] = null;
  }
}

// ---- diagnose for the new grows: drop the tank talk, speak in this grow's terms ----
function adaptDiagnose(S, out) {
  const pot = S.pot, how = S.method.how, soil = how === 'soil';
  let res = out;
  if (pot) res = res.filter(o => o.id !== 'water' && o.id !== 'oxygen' && o.id !== 'wtemp' && !(soil && o.id === 'ph'));
  res = res.map(o => {
    const c = Object.assign({}, o);
    if (pot && o.id === 'lowec') c.fix = 'Fix: give it a feed.'; /* v67 (critic round 16 M1): a pot has no tank to mix */
    if (pot && o.id === 'ec') c.fix = ecTotal(S) < stageOf(S).ec[0] ? 'Fix: give it a feed.' : 'Fix: water it through with plain water to wash the salt out.'; // v60 (play-test #14 #1): read the side of the band, not the old tank text (the pot text has no 'mix' since v52)
    if (S.out) {
      if (o.id === 'temp') c.fix = S.airT > 25 ? 'Fix: put shade cloth over it, or move the pots into the shade.' : 'Fix: nothing to switch on outside. Move pots under cover on cold nights.';
      if (o.id === 'rh' || o.id === 'vpd') { const dry = o.id === 'rh' ? S.rh < stageOf(S).rh[0] : S.vpd > stageOf(S).vpd[1]; c.fix = dry ? 'Fix: it is dry weather. Keep the soil watered and give it time.' : S.stage === 0 ? 'Fix: it is the weather. Give it time.' : 'Fix: it is the weather. Prune lower leaves for airflow and give it time.'; } /* v65 (critic round 14 #2): pruning for airflow is a damp-air answer; it was said for 38 % RH too */ /* v65 (play-test #17 M1): a seedling has no leaves to spare, and Prune refuses */
      if (o.id === 'light') c.fix = S.dliLast < stageOf(S).dli[0] ? (S.shade ? 'Fix: take the shade off for more sun.' : 'Fix: nothing to switch on. Move the pots to a sunnier spot.') : S.shade ? 'Fix: the shade is already on, so it is a bright spell. Give it time.' : 'Fix: put shade cloth over it.'; /* v65 (critic round 14 minor 5): it asked for shade cloth with Shade on */
    }
    return c;
  });
  if (pot) {
    const m = S.resL / S.cap, nm = soil ? 'soil' : 'coco';
    if (m < 0.35) res.push({ id: 'moisture', title: 'Root zone is dry', why: 'The ' + nm + ' is at ' + Math.round(m * 100) + '% moisture. Under 30% the plants wilt.', fix: 'Fix: water it' + (soil ? '.' : ' or turn on the drip.'), productHint: 'Drip kit and timer', severity: m < 0.2 ? 3 : 2 });
    else if (m > 0.92) res.push({ id: 'moisture', title: 'Root zone is soaked', why: 'The ' + nm + ' is at ' + Math.round(m * 100) + '% moisture. Roots need air as well as water.', fix: 'Fix: skip the next watering and let it drain.', productHint: 'Pots and saucers', severity: 1 });
  }
  if (S.out) res = outsideDiag(S, res);
  res.sort((a, b) => b.severity - a.severity);
  return res;
}
// Outside there is no fan, lamp or tank to blame. The cause is the weather and the two levers are Shade (heat, day) and Cover (cold, night) [M15].
// Cold and heat entries carry the lever's action id in `fix` (the UI points at that button) and `productHint: null`; `say` is the sentence to read out, `act` the same id.
const OUT_FIX = { heatdrop: 'Fix: put the shade on in the heat.', crack: 'Fix: water little and often, and cover it before heavy rain.', bolt: 'Fix: put the shade on in the heat and pick the heads early.', tip: 'Fix: put the shade on in the heat and keep the water steady.',
  dryair: 'Fix: put the shade on and water a little more often.', bit: 'Fix: water steadily, keep feed in range and put the shade on in the heat.', botrytis: 'Fix: prune the lower leaves for airflow. The wind does the rest.',
  dm: 'Fix: prune the lower leaves for airflow. A pest spray will not cure it.', pm: 'Fix: prune the lower leaves for airflow and spray milk (1 part to 9 of water).', curl: 'Fix: put the shade on in the heat.', smallfruit: 'Fix: cover it on cold nights.',
  mushyfruit: 'Fix: cover it on cold nights.', spidermite: 'Fix: spray neem oil (again in 5 days) and put the shade on.', thinfruit: 'Fix: nothing to switch on. Move the pots to a sunnier spot.', smallberry: 'Fix: nothing to switch on. Move the pots to a sunnier spot.',
  runners: 'Fix: ease the feed back into range.', greymould: 'Fix: prune the lower leaves and pick ripe berries quickly.', slugbite: 'Fix: clear dead leaves off the base.', aphid: 'Fix: spray neem oil (again in 5 days) and ease the feed back into range.',
  rootrot: 'Fix: put the shade on and water in the cool of the day.', fusarium: 'Fix: put the shade on and water in the cool of the day.' };
OUT_IDS.forEach(k => { OUT_FIX[k] = OUTP[k].fix; }); // [M-OUT]
const TENT_WORDS = /(fan|lights?|dimmer|tent|dehumidifw*|humidifier|chiller)/i;
function outsideDiag(S, res) {
  const s = stageOf(S), tb = s.tempDay, ver = S.method.where === 'veranda', tower = S.method.how === 'tower', C = CROP_DATA[S.cropId];
  const POT_ONLY = /(tank|reservoir|air pump)/i;
  res = res.filter(o => o.id !== 'temp' && o.id !== 'cold' && o.id !== 'heatdrop').map(o => {
    const c = Object.assign({}, o);
    if (OUT_FIX[o.id]) c.fix = OUT_FIX[o.id];
    if (TENT_WORDS.test(c.fix || '') || (!tower && POT_ONLY.test(c.fix || ''))) c.fix = 'Fix: it is the weather. Shade on in the heat, cover on cold nights.';
    if (TENT_WORDS.test(c.why || '') && OUT_FIX[o.id]) c.why = c.title + ': the weather outside is the cause.';
    c.productHint = null;
    return c;
  });
  const hot = S.pr.heat ? S.pr.heat : 0, chill = (S.pr.cold || 0) >= 1 || (S.a.chill || 0) >= 20;
  const cool = !S.cropDone && S.lastF && S.lastF.t < 0.92 && S.airT < (tb[0] + tb[1]) / 2;
  const heatNow = !S.cropDone && ((S.lit && S.airT > tb[1]) || hot >= 1);
  const loDay = Math.min(tb[0], coldLim(S, C, C.coldT || 15, 3)), coldNow = !S.lit || Math.round(S.airT) < loDay; /* v67 (critic round 16 M3): by day the Air tile's own low edge (graced, 13 C for a tomato), not the stage band (24 C), so a green tile never hears Cold night */ /* v66 (critic round 15 M1): "Cold night" by day, with the Air tile green, read as wrong; by day it is a reminder for dusk, with nothing to tap now */
  if (!S.lit && S.airT > tb[1]) { /* v71 (sweep of round 18): a night over the band top (26 C at 23:00) is not a cold night; the heat answer covers it */ }
  else if ((chill || cool) && !coldNow) res.push({ id: 'chill', title: 'Cold last night', why: 'The nights are cold for this crop. The day is fine.', fix: '', act: null, say: ver ? 'It was cold last night. Bring the pots in again at dusk.' : 'It was cold last night. Cover the bed again at dusk.', productHint: null, severity: 0 }); /* v69 (play-test #20 m5): a reminder for dusk, so an orange tile now is answered first */
  else if (chill || cool) {
    const sev = Math.max(S.pr.cold || 0, (S.a.chill || 0) >= 200 ? 3 : (S.a.chill || 0) >= 80 ? 2 : 1);
    const why = ver ? 'The pots are too cold. Bring them in.' : 'The bed is too cold at night. Cover the bed.';
    res.push({ id: 'chill', title: ver ? 'Cold night: the pots are too cold. Bring them in.' : 'Cold night. Cover the bed.', why: S.cover ? (S.lit ? 'It is covered and still cold. Keep it covered until it warms up.' : 'It is covered and still cold. Keep it covered until the sun is up.') : why,
      fix: S.cover ? '' : 'cover', act: S.cover ? null : 'cover', say: S.cover ? (ver ? 'Cold night. The pots are in, so they are as warm as they can be until the sun is up.' : 'Cold night. The bed is covered, so it is doing all it can until the sun is up.') /* v65 (play-test #17 m1): it said Cover the bed with the cover on */ : ver ? 'Cold night: the pots are too cold. Bring them in.' : 'Cold night. Cover the bed.', productHint: null, severity: sev });
  }
  if (heatNow) res.push({ id: 'temp', title: 'Hot day: put the shade on.', why: 'Air at ' + r2(S.airT, 0) + 'C is above the ' + tb[1] + 'C the ' + C.name.toLowerCase() + ' likes in daylight.', fix: S.shade ? '' : 'shade', act: S.shade ? null : 'shade',
    say: S.shade ? 'Hot day. The shade is already on.' : 'Hot day. Put the shade on.', productHint: null, severity: S.airT > tb[1] + 6 ? 3 : S.airT > tb[1] + 3 ? 2 : 1 });
  if (S.cover && !ver && !tower && S.lit && (S.coverDay || 0) >= 4 && Math.round(S.airT) >= loDay && !res.some(o => o.id === 'chill' && o.act)) res.push({ id: 'covered', title: 'Cover still on', why: 'The sun is up and the air is warm enough. Take the cover off so the bed gets the full light.', fix: 'cover', act: 'cover', say: 'The sun is up. Take the cover off.', productHint: null, severity: 1 }); /* v67 (play-test #19 m3): nothing said when to take the bed cover off; it stayed on for 46 days */
  { const tbn = S.lit ? s.tempDay : s.tempNight; if (S.cover && ver && Math.round(S.airT) > tbn[1] + 2) res.push({ id: 'covered', title: 'Pots too warm indoors', why: 'Inside it is ' + Math.round(S.airT) + 'C, above the ' + tbn[0] + '-' + tbn[1] + 'C this stage likes. The pots need the open air.', fix: 'cover', act: 'cover', say: 'The pots are too warm inside. Put them back out.', productHint: null, severity: 3 }); /* v71 (story round 18 minor 3): ranked first, ahead of the dry-air entries it causes */ } /* v69 (story round 17 minor 2): pots brought in every night cooked at 34 C and nothing said to put them out */
  if (S.cover && ver && (S.coverDay || 0) >= 24 && !res.some(o => o.id === 'covered')) res.push({ id: 'covered', title: 'Pots left inside', why: 'The pots have been indoors for ' + Math.floor(S.coverDay / 12) + ' days of daylight with no sun. Put them back out in the morning.', fix: 'cover', act: 'cover',
    say: 'The pots have been inside too long. Put them back out.', productHint: null, severity: 2 });
  if (!res.length && !S.cropDone && S.lastF && S.minF < 0.85 && !(S.lit && Math.round(S.airT) >= loDay && S.airT < (tb[0] + tb[1]) / 2)) { /* v66: no cold-night line in a fine daylight hour (v67: the tile's edge) */
    const colder = S.airT < (tb[0] + tb[1]) / 2, act = colder ? 'cover' : 'shade';
    res.push({ id: colder ? 'chill' : 'temp', title: colder ? 'Cold night. ' + (ver ? 'Bring the pots in.' : 'Cover the bed.') : 'Hot day: put the shade on.', why: 'The weather is slowing the plants down.', fix: act, act: act, say: colder ? (S.cover ? 'Cold night. ' + (ver ? 'The pots are in, so give it time.' : 'The bed is covered, so give it time.') : 'Cold night. ' + (ver ? 'Bring the pots in.' : 'Cover the bed.')) : S.shade ? 'Hot day. The shade is already on, so give it time.' : 'Hot day. Put the shade on.', productHint: null, severity: 1 });
  }
  { let st = null; try { st = (readings(S).status || {}).airTemp; } catch (e) {} if (S.cover && st !== 'warn' && st !== 'bad') res.forEach(o => { if (o.id === 'chill') o.severity = 0; }); } /* v69 (play-test #20 m5): covered and the Air tile green, there is nothing to do, so a wet Soil tile is answered first */
  return res;
}

// ---------------------------------------------------------------------------
// tick
// ---------------------------------------------------------------------------
function tick(S, hours) {
  const n = Math.max(0, Math.round(hours === undefined ? 1 : hours)), evs = [];
  for (let i = 0; i < n; i++) {
    step(S, evs);
    S.t++;
    S.hour = (S.hour + 1) % 24;
    if (S.hour === 0) dayEnd(S, evs);
  }
  return { state: S, events: evs };
}


// The one-plant harvest (exactly the old 'harvest' action). Returns the kg taken.
const CUT_REGROW_DAYS = 5; /* v67: days between basil cuts (the copy says it regrows in about a week) */
function harvestCore(S, evs, info) {
  const k = ripeKg(S), HC = CROP_DATA[S.cropId], mode = HC.harvest || 'multi';
  if (S.cropDone) { if (S.lost) info('Plant lost', 'There is nothing left to pick. Start again from the end card.'); else info('Crop finished', 'This crop is already harvested.'); return 0; } // [M29]
  if (k < 0.02 && S.mature && mode === 'multi') { S.cropDone = true; S.mature = true; S.hist = []; evs.push(ev('harvest', 'picked', 'Crop finished', 'Everything ripe is already picked, so this crop is done.', 0, [], '')); return 0; } /* v67 (critic round 16 M2): a tidy picker reached Crop complete with nothing ripe and the crop could never end */
  if (k < 0.02) { info('Nothing ripe', mode === 'multi' ? 'Unripe fruit stays on the plant. Check back in a few days.' : 'Nothing is big enough to pick yet. Check back in a few days.'); return 0; }
  if (mode === 'once') {
    S.harvestedKg += k; S.fruitKg -= k; S.cropDone = true; S.mature = true; S.hist = []; S.pr = {}; S.pestLevel = 0; S.leaf = 0.02; S.bio = 0.3;
    evs.push(ev('harvest', 'picked', 'Harvested ' + r2(k) + ' kg', 'Whole ' + HC.noun + ' cut. That finishes this crop.', 0, [], ''));
    return k;
  } else if (mode === 'cut') {
    if (!S.mature && S.lastCut > -90 && S.day - S.lastCut < CUT_REGROW_DAYS) { const dd = S.day - S.lastCut; info('Just cut', 'It was cut ' + (dd === 0 ? 'today' : dd === 1 ? 'yesterday' : dd + ' days ago') + '. Let it regrow for about ' + CUT_REGROW_DAYS + ' days between cuts, or the plants run out of leaf.'); return 0; } /* v67 (critic round 16 m6): every two days gave three times the yield of the weekly cut the copy describes */ /* v66 (play-test #18 m3): six cuts in one game hour stripped the basil to health 41 */
    const fin = S.mature, take = fin ? k : k * HC.cutFrac;
    S.harvestedKg += take; S.fruitKg -= take; S.lastCut = S.day;
    if (fin) { S.cropDone = true; S.hist = []; S.pr = {}; S.pestLevel = 0; S.leaf = 0.02; S.bio = 0.3; }
    else { S.leaf *= HC.cutLeaf || 0.7; S.bio *= HC.cutBio || 0.75; } // [M-H] basil: a cut takes a third, so less leaf is lost
    evs.push(ev('harvest', 'picked', 'Cut ' + r2(take) + ' kg', fin ? 'Final cut. That finishes this crop.' : 'Cut above a leaf pair; about two thirds of the leaf stays and the plants regrow in about a week.', 0, [], ''));
    return take;
  }
  S.harvestedKg += k; S.fruitKg -= k;
  evs.push(ev('harvest', 'picked', 'Harvested ' + r2(k) + ' kg', 'Ripe fruit picked; the plants keep setting new fruit.', 0, [], ''));
  return k;
}
// Tower harvest: p.slot (0-based) picks that one slot, otherwise every slot with something ripe. A finished slot is emptied so 'plant' can refill it.
function harvestSlots(S, p, evs, info) {
  let idx = []; S.slots.forEach((x, i) => { if (live(x)) idx.push(i); });
  if (p.slot !== undefined && p.slot !== null) {
    const i = Math.round(+p.slot);
    if (!S.slots[i] || !live(S.slots[i])) { info('Empty slot', 'There is no plant in slot ' + (i + 1) + '.'); return; }
    idx = [i];
  }
  const noun = CROP_DATA[S.cropId].noun || 'fruit', prKeep = S.pr; let total = 0, n = 0, cleared = 0;
  idx.forEach(i => {
    const sl = S.slots[i], before = S.harvestedKg;
    inSlot(S, sl, () => harvestCore(S, [], () => {}));
    if (S.harvestedKg > before) { total += S.harvestedKg - before; n++; }
    if (sl.cropDone) { S.slots[i] = emptySlot(); cleared++; }
  });
  S.pr = prKeep; syncAgg(S);
  if (!n) { info('Nothing ripe', 'Nothing is big enough to pick yet. Check back in a few days.'); return; }
  evs.push(ev('harvest', 'picked', 'Harvested ' + r2(total) + ' kg', n + (n === 1 ? ' slot' : ' slots') + ' picked' + (cleared ? '; ' + cleared + ' now empty, so plant again.' : '. The plants keep going.'), 0, [], ''));
}

// ---------------------------------------------------------------------------
// act
// ---------------------------------------------------------------------------
function act(S, id, p) {
  p = p || {};
  const evs = [], su = S.setup, np = CROP_DATA.nutrients.professors;
  let cost = 0;
  const info = (t, tx) => evs.push(ev('info', 'act_' + id, t, tx, 0, [], ''));
  const spend = c => { cost += c; S.cost += c; };
  const addWater = l => { S.supplyL += l; spend(l * 0.0025); };
  const useConc = ml => { S.nutrientMl += ml; S.refills = Math.floor(S.nutrientMl / 1000); spend(ml * np.costPerMl); };
  S.acts++;
  if ((NEWACT[id] || !isLegacy(S)) && id !== 'ask' && actionsFor(S).indexOf(id) < 0) { // not part of this grow: change nothing
    const clim = CLIMATE_ACTS.indexOf(id) >= 0;
    info(clim ? 'Not in a tent' : 'Not for this grow', clim ? 'Outside, the sun, the sky and the wind do this job. Shade cloth and cover are your levers.' : 'That one does not apply to ' + METHODS.how[methodOf(S).how].label.toLowerCase() + ' in ' + METHODS.where[methodOf(S).where].label.toLowerCase() + '.');
    return { state: S, events: evs, cost: 0 };
  }
  switch (id) {
    case 'water': {
      const how = S.method.how, top = how === 'soil' ? SOIL_TOP : FC, need = Math.max(0, top * S.cap - S.resL), soak = how === 'soil' && need < 0.005 * S.cap; // [M-x] v45 soil: one water or feed tops up to 80 %, the top of the band, never into amber
      const l = how === 'coco' ? need + 0.2 * S.cap : soak ? 0.3 * S.cap : need; // coco: a plain flush runs 20 % of capacity through; soil: an already wet pot is watered through and drains back to the 80 % band top (v66, critic round 15 m6: at field capacity it read too wet)
      addWater(l); potAdd(S, l, { keep: top, count: true, ph: (su.mods && su.mods.tapPh) || 7.4 }); /* v65 (critic round 14 #1): "water it through" was the advice for strong soil, but a wet pot only soaked (keep 1, nothing drained), so salt never left. Now the run-off past field capacity carries salt out (about a ninth of it a tap) */
      if (S.resL > 0.1 * S.cap) S.wilt = Math.max(0, S.wilt - 0.3);
      info((soak ? 'Already wet: ' : 'Watered: ') + (how === 'coco' ? 'coco' : 'soil') + ' ' + r2(S.resL / S.cap * 100, 0) + ' %', soak ? 'It was already wet, so the water ran through and washed some salt out. Feed level about ' + r2(ecTotal(S)) + '. Let it dry back before the next one.' : how === 'coco' ? 'Plain water ran through the coco, so some salt is gone. Moisture is ' + r2(S.resL / S.cap * 100, 0) + '%.' : 'Moisture is back to ' + r2(S.resL / S.cap * 100, 0) + '%.');
      break; }
    case 'feed': {
      const how = S.method.how, ml = feedMl(S, p), ec = ecForMl(ml), need = Math.max(0, FC * S.cap - S.resL);
      if (how === 'coco') {
        const l = need + 0.15 * S.cap; // hand feeding coco runs ~15 % to waste
        useConc(mixCostMl(S, l, ec)); addWater(l);
        potAdd(S, l, { ec: ec, ph: 6.2, keep: FC, count: true });
        info('Fed: EC now ' + r2(ecTotal(S), 1) + ' at pH ' + r2(S.ph, 1), 'Feed at EC ' + r2(ec) + ' went through. Moisture ' + r2(S.resL / S.cap * 100, 0) + '%, root zone EC about ' + r2(ecTotal(S)) + '.'); /* v36d: the toast used to quote the pour's strength (0.9) while the tile crept 0.27, 0.35, 0.44 */
      } else {
        const needS = Math.max(0, SOIL_TOP * S.cap - S.resL), soak = needS < 0.005 * S.cap, l = soak ? 0.04 * S.cap : needS, /* v65 (critic round 14 #3): a feed into a wet pot is a small pour that drains back to the band top, not a soak to 100 % that turns the moisture tile to too wet */ vol = S.nplants * SOIL_DOSE * CROP_DATA[S.cropId].stages[CROP_DATA[S.cropId].stages.length - 1].uptake[1];
        useConc(mixCostMl(S, vol, ec)); addWater(l);
        potAdd(S, l, { keep: SOIL_TOP, count: true }); // [M-x] v45
        let add = Math.max(0, ec - np.waterEC) * vol;
        if (p.mlPerL === undefined) { const eb = stageOf(S).ec, e0 = ecTotal(S); add = Math.min(Math.max(add, ((eb[0] + eb[1]) / 2 - e0) * S.cap), Math.max(0, (eb[1] - e0) * S.cap)); } /* v66 (critic round 15 m1) kept at the band top: true EC never passes it; an amber reading straight after a Feed is meter drift, which pH cal and EC cal teach. A cap at 0.75, 0.85 or 0.9 of the band cost a covered veranda tomato 4 to 8 health by day 35 */ /* v65 (critic round 14 #1 and #3): the plain feed brings soil up to the middle of the stage band and never past its top, in a tent too. A weekly feed in a tent piled up to EC 6 and killed fruit crops by day 38, and in a big garden bed a feed sized for the plants barely moved the tile */ // [M16] outdoors the plain weekly feed tops the pot up to the top of the band and no further: plants draw little in a cool spring, so a blind weekly dose used to pile up and burn (an explicit strength still can)
        S.nutL += add; S.ph = clamp(S.ph - 0.02, 3.5, 9);
        info('Fed: a weekly dose', 'A feed drench went into the soil. Feed level is about ' + r2(ecTotal(S)) + ' now' + (ecTotal(S) > stageOf(S).ec[1] + 0.8 ? ', which is too strong. Water it through.' : '.'));
      }
      break; }
    case 'drip': {
      const on = p.on === undefined ? !S.drip : !!p.on;
      S.drip = on;
      if (on) { const ml = feedMl(S, p); info('Drip on: feeds every 4 h in the light', 'Every 4 hours of daylight the pots are topped up to 80% with feed at EC ' + r2(ecForMl(ml)) + '. Change the mix when the stage changes.'); }
      else info('Drip off', 'The timer is off, so watering is back to you.');
      break; }
    case 'shade': {
      S.shade = p.on === undefined ? !S.shade : !!p.on;
      info(S.shade ? 'Shade on' : 'Shade off', S.shade ? 'About 30% less light, and 2.5 degrees cooler while the sun is out.' : 'Full sun again.');
      break; }
    case 'cover': {
      const ver = S.method.where === 'veranda';
      S.cover = p.on === undefined ? !S.cover : !!p.on; if (!S.cover) S.coverDay = 0;
      info(ver ? (S.cover ? 'Pots brought in' : 'Pots back out') : (S.cover ? 'Covered for the night' : 'Uncovered'),
        ver ? (S.cover ? 'About 6 degrees warmer overnight, but no sun while they are in. Put them back out in the morning.' : 'Back in the sun and the open air.') : (S.cover ? 'Frost cloth over the bed: about 3 degrees warmer at night, 15% less light by day. Take it off in the morning.' : 'Cloth off. Full light again.'));
      break; }
    case 'plant': {
      const i = S.slots.findIndex(x => x.planted === null || x.planted === undefined);
      if (i < 0) { info('Tower full', 'Every slot has a plant in it. Harvest one to make room.'); break; }
      S.slots[i] = newSlot(CROP_DATA[S.cropId], S.day); S.plantedEver = (S.plantedEver || 0) + 1; spend(0.8); S.cropDone = false;
      syncAgg(S);
      info('Planted slot ' + (i + 1), 'A seedling went into the slot.');
      break; }
    case 'mix': {
      let ml = clamp(+p.mlPerL || 0, 0, 12), target = ecForMl(ml), V = S.resL;
      if (V < 0.5) { info('Tank empty', 'Nothing to dose yet. Add water first, then mix nutrients.'); break; }
      const cur = ecTotal(S), fullMl = ml;
      S.mixHalf = false;
      // pass 8b: p.stepOver (ui.js passes 0.6) = a jump bigger than that EC is made in two taps, halfway first ("Mix feed a little at a time", PLAYTEST-DEV-v34 wrong 7).
      // The dose is just the same mix aimed at a nearer EC; S.mlPerL keeps the full mix so Top up with feed still aims at the real target.
      if (+p.stepOver > 0 && target - cur > +p.stepOver) { target = cur + (target - cur) / 2; ml = mlForEc(target); S.mixHalf = true; }
      const need = target * V - S.inertL;
      if (need <= S.nutL + 1e-6 && cur <= stageOf(S).ec[1] + 1e-6) { info('Feed already right', 'The tank is already in the green for this stage, so there is nothing to mix yet.'); break; } /* v58 (play-test #13 #2): an in-band tank was told to add plain water */
      if (need <= S.nutL + 1e-6) { info('EC already high', (S.setup && S.setup.meters && !S.setup.meters.ec) ? 'The tank is already stronger than that mix. Add plain water to bring it down.' : 'Tank is at EC ' + r2(cur) + ', above that mix (' + r2(target) + '). Add plain water to bring it down.'); S.mlPerL = fullMl; S.mixHalf = false; break; } /* v56 (play-test #12 #4): no EC figure without an EC meter */
      useConc(concPerL(ml) * V * (target - cur) / Math.max(target, 0.3));
      S.nutL = need; S.ph = 0.5 * S.ph + 0.5 * 6.2; S.mlPerL = fullMl;
      info('Nutrients mixed', S.mixHalf ? 'Feed strength is about ' + r2(ecTotal(S)) + ', halfway to the target. Mix again to finish.' : 'Feed strength is now about ' + r2(ecTotal(S)) + '.'); /* pass 7: one plain sentence; the ml/L detail was a wall of numbers for a first-timer */
      break; }
    case 'phDown': case 'phUp': {
      const ml = clamp(+p.ml || 0, 0, 50), bandW = stageOf(S).ph[1] - stageOf(S).ph[0];
      // v50 tap rule: the raw dose is 0.35 pH per 10 L of water in the root zone, so a small coco pot (about 10 L) moved 1 to 2 pH per standard tap and a 30 L tub 0.47, against a band 0.4 to 0.6 wide.
      // One dose now moves pH by at most half this crop and stage's pH band (less PH_TAP_PAD for the hour of mixing), and a tap of PH_TAP_ML or more (what the pH buttons add) by at least PH_TAP_MIN. Doses under the cap are untouched, so a caller aiming a small correction with 0.35 per 10 L still lands on it; a bigger aim lands short and doses again next hour.
      let d = 0.35 * (su.phDoseScale || 1) * ml / Math.max(S.resL / 10, 0.5);
      if (ml >= PH_TAP_ML - 1) d = Math.max(d, PH_TAP_MIN + PH_TAP_PAD);
      d = Math.min(d, Math.max(PH_TAP_MIN + PH_TAP_PAD, bandW / 2 - PH_TAP_PAD) * Math.max(1, ml / PH_TAP_ML));
      S.ph = clamp(S.ph + (id === 'phUp' ? d : -d), 3.5, 9); spend(ml * 0.03); /* v52: Ph down 1L is $27.27 ex GST in products.js, about 3 cents a mL with GST; the Spent stat follows the catalogue, not a made-up rate */
      info(id === 'phUp' ? 'pH up added' : 'pH down added', 'pH should ' + (id === 'phUp' ? 'rise' : 'fall') + ' to about ' + r2(S.ph, 1) + '. Wait a little before adding more.'); // [M-x] v44
      break; }
    case 'topUp': {
      const room = S.cap - S.resL, l = clamp(+p.litres || 0, 0, room);
      if (l <= 0) { info('Tank full', 'The tank is already at capacity, so nothing was added.'); break; }
      const V = S.resL, wn = !!p.withNutrients;
      const ecIn = wn ? ecForMl(S.mlPerL) : np.waterEC;
      S.nutL += wn ? (ecIn - np.waterEC) * l : 0;
      const tapM = su.mods; // hard-water modifier: tap water has its own pH / EC
      S.inertL += (tapM && tapM.tapEC || np.waterEC) * l;
      S.ph = (S.ph * V + (wn ? 6.3 : (tapM && tapM.tapPh || 7.4)) * l) / (V + l);
      S.resL = V + l; addWater(l);
      if (wn) useConc(concPerL(S.mlPerL) * l * (ecIn - np.waterEC) / Math.max(ecIn, 0.3));
      if (S.resL > 0.5) S.wilt = Math.max(0, S.wilt - 0.3);
      info('Tank topped up', 'The tank is now ' + r2(S.resL, 1) + ' L' + (wn ? '.' : ', and the feed is a little weaker.'));
      break; }
    case 'changeRes': {
      S.runoffL += S.resL; addWater(S.cap);
      const ec = ecForMl(S.mlPerL);
      S.resL = S.cap; S.nutL = (ec - np.waterEC) * S.cap; S.inertL = np.waterEC * S.cap;
      S.ph = 6.2; S.wT = (S.wT + 20) / 2; S.wilt = 0; S.a.rot *= 0.3; S.a.rootrot *= 0.3; S.a.fusarium *= 0.3; S.a.ecH = 0; S.a.iron = 0;
      useConc(concPerL(S.mlPerL) * S.cap * (ec - np.waterEC) / Math.max(ec, 0.3));
      info('Tank changed', 'Fresh water and feed, and the old slime is gone.');
      break; }
    case 'lights': {
      S.lightHours = clamp(Math.round(p.hours === undefined ? photoperiod(S) : +p.hours), 0, 24);
      if (p.dim !== undefined) S.dim = clamp(+p.dim, 0.3, 1);
      info('Lights set', S.lightHours + ' hours of light a day.');
      break; }
    case 'fan': {
      const lv = clamp(Math.round(p.level === undefined ? 2 : +p.level), 0, 3);
      su.fanM3h = FAN_LEVELS[lv];
      const nm = ['off', 'low', 'medium', 'high'][lv];
      info('Fan ' + nm, lv === 0 ? 'No extraction: heat and moisture will build up in the tent.' : lv === 3 ? 'Expect a cooler, drier tent.' : lv === 1 ? 'Expect a warmer, more humid tent.' : 'A balanced middle setting.');
      break; }
    case 'humidity': {
      const m = ['humidify', 'dehumidify'].indexOf(p.mode) >= 0 ? p.mode : 'off';
      su.humMode = m;
      info(m === 'off' ? 'Humidity unit off' : m === 'humidify' ? 'Humidifier on' : 'Dehumidifier on',
        m === 'off' ? 'Humidity is back to what the fan and plants make.' : m === 'humidify' ? 'It adds moisture to the tent, about 12% more at low fan.' : 'It pulls moisture out of the tent, about 12% less at low fan.');
      break; }
    case 'prune': {
      if (S.stage < 1) { info('Too young', 'The seedlings have no leaves to spare yet. Wait for the vegetative stage.'); break; }
      if (S.pruneCool > 0) { info('Pruned recently', 'Plants need a few days to recover before the next prune.'); break; }
      S.pruneDays = 5; S.pruneCool = 4; S.leaf *= 0.92; S.bio *= 0.97; S.a.bot *= 0.6; S.a.greymould *= 0.6; S.a.slugbite *= 0.3; /* [M-H] prune plus two dry days cures it */
      if (S.out) { S.a.o_snails = (S.a.o_snails || 0) * 0.5; S.a.o_caterpillars = (S.a.o_caterpillars || 0) * 0.7; S.a.o_windsnap = (S.a.o_windsnap || 0) * 0.3; } // [M-OUT] dead leaves cleared, broken stems cut
      if (S.slots) S.slots.forEach(x => { if (live(x)) { x.leaf *= 0.92; x.bio *= 0.97; } });
      info('Pruned', 'Airflow is better for about 5 days, which cuts mould risk. Expect a small growth setback.');
      break; }
    case 'spray': {
      if (S.out && outPest(S, info)) break; // [M-OUT] outside, the button does the right job for the problem on the plant
      // [M-H] two sprays, named plainly. The UI's single button sends 'plantGuard' (an old id): that is neem oil. 'herbal' is the soap spray. A pest spray does not cure mildew or slugs:
      // with slugs active it lays bait, with powdery mildew active it is a milk spray, and on a pest-free tent it is a precaution only.
      const soap = p.product === 'herbal' || p.product === 'soap', a = S.a, pr = S.pr;
      const pests = S.pestLevel > 0 || a.aphid > 0.5 || a.spidermite > 0.5 || (S.slots && S.slots.some(x => live(x) && x.pest > 0));
      const slugs = !!pr.slugbite && !S.out, powder = !!pr.pm, only = (slugs || powder) && !pests;
      if (slugs) { spend(1.5); a.slugbite *= 0.3; info('Slug bait laid', 'Bait works over a couple of days. Pruning dead leaves and drying the air for two days finishes the job.'); }
      if (powder) { spend(1); a.pm *= 0.5; info('Milk spray', 'One part milk to nine of water slows powdery mildew. Repeat in a week and thin the old leaves.'); }
      if (only) break;
      const k = soap ? 0.5 : 0.3; // fraction left after a spray: neem knocks back about 70 percent, soap about half
      spend(soap ? 2.2 : 3.5); ecoSpray(S); // [M33]
      S.pestLevel *= k; S.immune = soap ? 3 : 5;
      a.aphid *= k; a.spidermite *= soap ? 0.7 : k;
      if (S.pestLevel < 0.5) S.pestLevel = 0;
      if (S.slots) S.slots.forEach(x => { x.pest *= k; if (x.pest < 0.5) x.pest = 0; });
      if (soap) info('Soap spray', 'Knocks back soft bodies such as aphids and thrips by about half. Spray again in 3 days.');
      else info('Neem oil sprayed', 'Knocks aphids, thrips and mites back by about 70 percent. Spray again in 5 days.');
      break; }
    case 'calibrate': {
      spend(1.5); S.drift.ec = 0; S.drift.ph = 0; S.calDay = S.day; /* v68: the calibrate advice waits five days after a re-zero */
      info('Meters calibrated', 'EC and pH readings are accurate again; they drift slowly over weeks.');
      break; }
    case 'harvest': {
      if (S.slots) harvestSlots(S, p, evs, info); else harvestCore(S, evs, info);
      break; }
    default: info('Unknown action', 'No action called ' + String(id) + '.');
  }
  return { state: S, events: evs, cost: r2(cost, 3) };
}

// ---------------------------------------------------------------------------
// readings / stageInfo / score
// ---------------------------------------------------------------------------
// v58 (play-test #13 #3): the decimals each reading's tile prints (ui.js RLAB: ec 2, ph 1, air 0, water 0, DLI 0); a reading is rated at that precision
const SHOWN_DP = { ec: 2, ph: 1, airTemp: 0, waterTemp: 0, dli: 0 };
function shown(k, x) { return x === null || x === undefined || !(k in SHOWN_DP) ? x : r2(x, SHOWN_DP[k]); }
function rating(x, lo, hi, m) { return x === null ? 'unknown' : (x >= lo && x <= hi) ? 'good' : (x >= lo - m && x <= hi + m) ? 'warn' : 'bad'; }
function stageInfo(S) {
  const s = stageOf(S), C = CROP_DATA[S.cropId];
  const t = { ec: s.ec, ph: s.ph, tempDay: s.tempDay, tempNight: s.tempNight, rootTemp: s.rootTemp, rh: s.rh, vpd: s.vpd, ppfd: s.ppfd, dli: s.dli,
    photoperiod: s.photoperiod, uptakeLPerDay: s.uptake, mlPerL: [r2(mlForEc(s.ec[0]), 1), r2(mlForEc(s.ec[1]), 1)] };
  return { name: s.name, index: S.stage, progress0to1: r2(stageProgress(S), 3), replay: !!S.replay, targets: t, stageCount: C.stages.length };
}
// [M16] How the outside readings are rated. The tent bands are tent-tuned, so outdoors four tiles are softened (the rest keep the plain rule):
//  * humidity (rh): never 'bad'; 'warn' only after 24 h in a row above the band (morning dew is normal; mould risk is a problem event already).
//  * air temperature: the cold side is 'warn' for the first 24 h in a row under the band and 'bad' only after that; the hot side keeps its rules.
//  * VPD: not rated ('unknown'; tilesFor leaves the tile out).
//  * sun (ppfd) and daily light (dli): you cannot switch the sun on, so low light is 'good'; too much sun is 'warn' only when the air is also over the day band, 'bad' when 3 C over it; DLI is 'warn' only at twice the top of the band.
//  * rain and wind: amber only for a real soaking (over 40 mm in a day) or a gale (over 40 km/h), red at 80 mm / 60 km/h.
const OUT_DLI_MAX = { tomato: 65, chilli: 65, capsicum: 65, cucumber: 65, strawberry: 55, basil: 55, lettuce: 40 }; // [M-H] outdoor daily light a crop shrugs off (mol/m2/d)
function outRatings(S, v, status, s, tb, targets) {
  v = Object.assign({}, v, { airTemp: shown('airTemp', v.airTemp) }); /* v58: rated at the precision the tile prints */
  const hot = v.airTemp !== null && v.airTemp > tb[1];
  if (v.rh !== null) status.rh = v.rh > s.rh[1] && (S.a.rhHi || 0) >= GRACE_H ? 'warn' : 'good';
  if (v.airTemp !== null && status.airTemp === 'bad' && v.airTemp < tb[0] && (S.a.coldRun || 0) < GRACE_H) status.airTemp = 'warn';
  if (v.airTemp !== null) { const C = CROP_DATA[S.cropId], lo = Math.min(tb[0], coldLim(S, C, C.coldT || 15, 3)); targets.airTemp = [lo, tb[1]]; if (lo < tb[0]) { const g = status.airTemp; status.airTemp = rating(v.airTemp, lo, tb[1], 3); if (g === 'good' && status.airTemp !== 'good') status.airTemp = g; if (status.airTemp === 'bad' && v.airTemp < lo && (S.a.coldRun || 0) < GRACE_H) status.airTemp = 'warn'; } } // [M-x] v45 outdoors the Air tile's low edge is where the crop actually stalls (not the tent's 24 C): an 11 C morning is not an amber chip against a tent target
  status.vpd = 'unknown';
  if (v.ppfd !== null) status.ppfd = v.ppfd > s.ppfd[1] + 80 && hot ? (v.airTemp > tb[1] + 3 ? 'bad' : 'warn') : 'good';
  if (v.rain !== null) { status.rain = v.rain <= 40 ? 'good' : v.rain <= 80 ? 'warn' : 'bad'; targets.rain = [0, 40]; } // a shower is not the grower's fault: amber only for a real soaking
  if (v.wind !== null) { status.wind = v.wind <= 40 ? 'good' : v.wind <= 60 ? 'warn' : 'bad'; targets.wind = [0, 40]; }
  if (v.dli !== null) { const dm = OUT_DLI_MAX[S.cropId] || 65; targets.dli = [s.dli[0], dm]; status.dli = v.dli > dm && v.airTemp !== null && v.airTemp > tb[1] + 3 ? 'warn' : 'good'; } // [M-H] full-sun crops are fine at 40 to 65 mol; too much only matters with heat
  if (status.waterTemp === 'bad' || status.waterTemp === 'warn') status.waterTemp = status.airTemp; // [M16] the root-zone temperature is not a tile outside; a hidden red used to count in the speed guard and the trouble tally, so it follows the air's graced rating
}
function readings(S) {
  const sh = shown; /* v58: every tile is rated at the precision it prints */
  const s = stageOf(S), m = S.setup.meters, lit = S.lit;
  const tb = lit ? s.tempDay : s.tempNight;
  const ppfd = r2(S.replay || S.out ? (S.ppfdNow || 0) : ppfdNow(S), 0);
  const v = {
    ec: m.ec ? r2(Math.max(0, ecTotal(S) * (1 + (S.pot ? 0 : S.drift.ec) * 0.5)), 2) : null, /* v69 (critic round 17 m1): coco has no pH cal button either, so pot meters read true; v67 (critic round 16 m2): soil has no Calibrate button, so its meters read true */
    ph: m.ph ? r2(S.ph + (S.pot ? 0 : S.drift.ph), 2) : null,
    airTemp: m.thermo ? r2(S.airT, 1) : null, rh: m.thermo ? r2(S.rh, 0) : null, vpd: m.thermo ? r2(S.vpd, 2) : null,
    ppfd: m.par ? ppfd : null, dli: m.par ? r2(S.dliLast, 1) : null,
    waterTemp: m.thermo ? r2(S.wT, 1) : null, reservoirL: r2(S.resL, 1), do2: m.do2 ? r2(S.do2, 1) : null
  };
  const rs = S.resL / S.cap;
  const status = {
    /* v58 (play-test #13 #3): a reading is rated at the precision its tile prints (shown(), below), so a tile never reads "6.2, target 5.6 to 6.2" in amber */
    ec: rating(sh('ec', v.ec), s.ec[0], s.ec[1], 0.5), ph: rating(sh('ph', v.ph), s.ph[0], s.ph[1], 0.3),
    airTemp: rating(sh('airTemp', v.airTemp), tb[0], tb[1], 3), rh: rating(v.rh, s.rh[0], s.rh[1], 10), vpd: rating(v.vpd, s.vpd[0], s.vpd[1], 0.35),
    ppfd: rating(v.ppfd, s.ppfd[0], s.ppfd[1], 80), dli: rating(sh('dli', v.dli), s.dli[0], s.dli[1], 5),
    waterTemp: rating(sh('waterTemp', v.waterTemp), s.rootTemp[0], s.rootTemp[1], 2.5), reservoirL: rs > 0.4 ? 'good' : rs > 0.15 ? 'warn' : 'bad',
    do2: rating(v.do2, 6, 99, 2)
  };
  const targets = { ec: s.ec, ph: s.ph, airTemp: tb, rh: s.rh, vpd: s.vpd, ppfd: s.ppfd, dli: s.dli, waterTemp: s.rootTemp,
    reservoirL: [0.4 * S.cap, S.cap], do2: [6, 12] };
  const unharv = S.fruitKg;
  if (!isLegacy(S)) {
    const mo = S.pot ? S.resL / S.cap : null, lo = S.method.how === 'coco' ? 0.5 : 0.45, hi = S.method.how === 'coco' ? 0.85 : 0.8;
    const rain = S.out ? S.rainLog.reduce((a, x) => a + x, 0) : null, wind = S.out && S.method.where === 'outdoors' ? (S.windNow || 0) : null;
    v.moisture = mo === null ? null : r2(mo, 2); v.rain = rain === null ? null : r2(rain, 1); v.wind = wind === null ? null : r2(wind, 0); v.shade = S.out ? (S.shade ? 1 : 0) : null; v.cover = S.out ? (S.cover ? 1 : 0) : null; v.shadeLabel = S.out ? (S.shade ? 'On' : 'Off') : null; v.coverLabel = S.out ? (S.cover ? 'On' : 'Off') : null;
    status.moisture = mo === null ? 'unknown' : rating(mo, lo, hi, 0.15); targets.moisture = [lo, hi];
    status.rain = rain === null ? 'unknown' : rain <= 15 ? 'good' : rain <= 40 ? 'warn' : 'bad'; targets.rain = [0, 15];
    status.wind = wind === null ? 'unknown' : wind <= 25 ? 'good' : wind <= 40 ? 'warn' : 'bad'; targets.wind = [0, 25];
    status.shade = S.out ? 'good' : 'unknown'; status.cover = S.out ? 'good' : 'unknown';
    if (S.out) outRatings(S, v, status, s, tb, targets);
  }
  let graceKeys = null; // [M-N1] v44: one rule for every tile in the tent's first 24 hours: every tile that would be amber or red reads settling-in (status good, no flag) and readings.grace names them with graceNote, so no tile is green or red alone while its band says otherwise
  if (!S.replay && S.t < 24) { // [M-x] v47 outdoors only the pot chemistry (EC, pH) settles in; the weather tiles stay honest
    graceKeys = []; Object.keys(status).forEach(k => { if ((!S.out || k === 'ph' || k === 'ec') && (status[k] === 'bad' || status[k] === 'warn')) { graceKeys.push(k); status[k] = k === 'airTemp' && status[k] === 'bad' ? 'warn' : 'good'; } }); // air stays amber when it is red: the one tile with a lever in your hand (M25 allows at most that one amber)
  }
  return Object.assign(v, {
    method: { where: methodOf(S).where, how: methodOf(S).how }, drip: !!S.drip, slots: S.slots ? S.slots.length : 0,
    health: r2(S.health, 0), stage: s.name, day: S.day, hour: S.hour, status: status, targets: targets,
    lightsOn: lit, replay: !!S.replay, fanM3h: S.setup.fanM3h, fanLevel: fanLevel(S), humidity: S.setup.humMode, season: S.setup.season, stageProgress: r2(stageProgress(S), 3),
    plant: { biomass: r2(S.bio * S.nplants, 0), leafArea: r2(S.leaf * S.nplants, 2), plants: S.nplants,
      fruitCount: Math.round(unharv * 1000 / CROP_DATA[S.cropId].fruitG), fruitKg: r2(unharv, 2), ripeKg: r2(ripeKg(S), 2), harvestedKg: r2(S.harvestedKg, 2),
      leafy: !!CROP_DATA[S.cropId].leafy, harvestMode: CROP_DATA[S.cropId].harvest || 'multi', sinceCutDays: S.lastCut > -90 ? S.day - S.lastCut : null, look: look(S) },
    problems: Object.assign({}, S.pr), mature: S.mature, cropDone: !!S.cropDone, crop: S.cropId
  }, graceKeys && graceKeys.length ? { grace: graceKeys, graceNote: 'Settling in, first day' } : null, S.lost ? /* [M-N1] */ { lost: Object.assign({}, S.lost) } : S.zh ? { zeroH: S.zh } : null); // [M29] only present once the health has sat at 0 / the plant is lost, so a healthy run's readings are unchanged
}
// Suggested extra props for Art.plant(): spots (brown), bolt, mildew (white powder), yellow (chlorosis), cut (0..1 just cut back)
function look(S) {
  const p = S.pr, ch = Math.max(p.iron || 0, 0) / 3;
  return { spots: r2(Math.max(p.botrytis || 0, p.ecburn || 0, p.ber || 0, (p.tip || 0) * 1.2, (p.bit || 0) * 0.6) / 4, 2), bolt: r2((p.bolt || 0) / 3, 2),
    mildew: r2(Math.max(p.pm || 0, 0) / 3, 2), yellow: r2(Math.max(ch, (p.dm || 0) / 4), 2), cut: S.lastCut > -90 && S.day - S.lastCut < 4 ? r2(1 - (S.day - S.lastCut) / 4, 2) : 0 };
}
function score(S) {
  const C = CROP_DATA[S.cropId];
  const yieldKg = S.harvestedKg + ripeKg(S);
  const target = C.yieldTarget * (S.plantedEver || S.nplants) * towerX(S), yEff /* [M-TOW] */ = Math.max(yieldKg, 0.25 * target); // a failed crop is not rewarded for being frugal
  const lPerKg = S.supplyL / yEff;
  const ep = ecoParts(S), eco = ep.water + ep.feed + ep.spray + ep.climate; // [M33] player-driven, 0 to 100, four parts of 25
  const yieldScore = clamp(100 * yieldKg / target, 0, 100);
  return { yieldKg: r2(yieldKg, 2), health: r2(S.health, 0), waterUsedL: r2(S.supplyL, 1), feedMl: Math.round(S.nutrientMl || 0), lost: !!S.lost, // [M33] [M29]
    energyKWh: r2(S.kWh, 1), costAUD: r2(S.cost, 2), eco: r2(eco, 0), overall: r2(0.45 * yieldScore + 0.25 * S.health + 0.3 * eco, 0),
    runoffL: r2(S.runoffL, 1), refills: S.refills,
    ecoParts: Object.assign(ep, { lPerKg: r2(lPerKg, 1) }) };
}
// ---------------------------------------------------------------------------
// problemLooks(S): every per-crop problem look that Art.plant() draws, as { field: 0..1 }, from the live state. The same ramps as ui.js crop3Looks for the seven
// older fields (tipburn, cold, leggy, bitter, mgdef, drop, scald), plus the pass-8 fields. Every key is always present (0 for crops it does not apply to), so
// Object.assign(view, Sim.problemLooks(S)) both sets and resets them. Uses raw sim state, so a missing meter never hides a visible symptom.
// ---------------------------------------------------------------------------
const LOOK_KEYS = ['tipburn', 'cold', 'leggy', 'bitter', 'mgdef', 'drop', 'scald', 'ber', 'crack', 'curl', 'captip', 'smallfruit', 'aphid', 'thinfruit', 'greymould', 'runners', 'smallberry', 'slugbite', 'rootrot', 'downy', 'fusarium', 'spidermite', 'mushyfruit'];
function problemLooks(S) {
  const out = {}; LOOK_KEYS.forEach(k => { out[k] = 0; });
  if (!S || !S.cropId) return out;
  const crop = S.cropId, st = S.stage, T = S.airT, dli = S.dliLast, pr = S.pr || {}, dliT = stageOf(S).dli || [0, 0];
  const ramp = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / (hi - lo))), sev = k => Math.max(0, Math.min(1, (pr[k] || 0) / 3));
  if (crop === 'lettuce') out.tipburn = ramp(sev('tip'), 0, 1);
  if (crop === 'basil' && st >= 1) {
    out.cold = Math.max(ramp(15 - T, 0, 5), sev('cold'));
    out.leggy = dliT[0] > 0 && typeof dli === 'number' ? ramp(dliT[0] * 0.8 - dli, 0, dliT[0] * 0.5) : 0;
  }
  if (crop === 'cucumber' && st >= 1) { out.bitter = Math.max(sev('bit'), sev('wilt') * 0.8); out.mgdef = Math.max(sev('lowec'), sev('phlow')); }
  if ((crop === 'chilli' || crop === 'capsicum') && st >= 2) {
    out.drop = Math.max(ramp(T - 32, 0, 4), ramp(15 - T, 0, 4), sev('heat'));
    out.scald = dliT[1] > 0 && typeof dli === 'number' ? Math.min(ramp(T - 31, 0, 4), ramp(dli / dliT[1], 1.1, 1.5)) : 0;
  }
  if (crop === 'tomato' || crop === 'capsicum') out.ber = sev('ber');
  if (crop === 'tomato') { out.crack = sev('crack'); out.curl = sev('curl'); }
  if (crop === 'capsicum') { out.captip = sev('captip'); out.smallfruit = sev('smallfruit'); }
  if (crop === 'chilli') { out.aphid = sev('aphid'); out.thinfruit = sev('thinfruit'); }
  if (crop === 'strawberry') { out.greymould = sev('greymould'); out.runners = sev('runners'); out.smallberry = sev('smallberry'); }
  if (crop === 'lettuce') { out.slugbite = sev('slugbite'); out.rootrot = sev('rootrot'); }
  if (crop === 'basil') { out.downy = sev('dm'); out.fusarium = sev('fusarium'); }
  if (crop === 'cucumber') { out.spidermite = sev('spidermite'); out.mushyfruit = sev('mushyfruit'); }
  if (S.out) OUT_IDS.forEach(id => { const lk = OUTP[id].look[crop]; if (lk) out[lk] = Math.max(out[lk], sev(id)); }); // [M-OUT] the outdoor problems reuse the plant visuals above
  return out;
}
function fanLevel(S) { let b = 0; for (let i = 1; i < 4; i++) if (Math.abs(FAN_LEVELS[i] - S.setup.fanM3h) < Math.abs(FAN_LEVELS[b] - S.setup.fanM3h)) b = i; return b; }

// ---------------------------------------------------------------------------
// Save / load. State is plain JSON (the PRNG is the numeric S.rng), so a round trip is exact.
// ---------------------------------------------------------------------------
const SIM_VERSION = 2; // shared with ui.js as Sim.SIM_VERSION
function serialize(S) { return JSON.stringify({ simVersion: SIM_VERSION, state: S }); }
function deserialize(str) {
  const o = JSON.parse(str), S = o && o.state ? o.state : o;
  if (!S || !S.setup || !CROP_DATA[S.cropId]) throw new Error('Not a HyGrow save');
  S.rng = S.rng >>> 0;
  /* a hand-edited or partial save must never load into a sim that throws every frame: fill the objects tick() dereferences */
  if (!S.pr || typeof S.pr !== 'object') S.pr = {};
  if (!S.a || typeof S.a !== 'object') S.a = {};
  ['ber', 'iron', 'ecH', 'low', 'rot', 'bot', 'heat', 'crack', 'cold', 'dryHot', 'dryAir', 'tip', 'bolt', 'dm', 'pm', 'bit'].concat(NEW_KEYS).forEach(k => { if (S.a[k] === undefined) S.a[k] = 0; });
  if (!S.acc || typeof S.acc !== 'object') S.acc = { sum: 0, w: 0, dli: 0 };
  if (!isFinite(S.t)) throw new Error('Not a HyGrow save');
  if (S.cropDone === undefined) S.cropDone = false; if (S.lastCut === undefined) S.lastCut = -99;
  if (!S.method || typeof S.method !== 'object') S.method = { where: 'tent', how: 'hydro' };
  if (S.method.how === 'soil' || S.method.how === 'coco') { S.pot = true; if (!S.a.wet) S.a.wet = 0; } if (S.method.where !== 'tent') { S.out = true; if (!Array.isArray(S.rainLog)) { S.rainLog = []; for (let i = 0; i < 24; i++) S.rainLog.push(0); } if (!(S.dayLen > 0)) S.dayLen = 12; }
  if (S.method.how === 'tower' && !Array.isArray(S.slots)) throw new Error('Not a HyGrow save');
  if (S.setup.humMode === undefined) S.setup.humMode = 'off'; if (S.refKWh === undefined) S.refKWh = S.kWh || 0;
  return S;
}

// ---------------------------------------------------------------------------
// CSV replay ("My setup"): rows = [{t, air_temp_c, rh_pct, vpd_kpa, co2_ppm, ppfd_umol_m2_s, light_on,
// ec_mscm, ph, water_temp_c, reservoir_l}] (any subset, nulls ok). One row per tick, looping.
// ---------------------------------------------------------------------------
function attachClimate(S, rows) {
  const ok = (rows || []).filter(r => r && typeof r === 'object').map(r => { const c = {}; for (const k in r) c[k] = r[k] === undefined || r[k] === '' || (typeof r[k] === 'number' && !isFinite(r[k])) ? null : r[k]; return c; });
  if (!ok.length) throw new Error('No climate rows');
  ok.sort((a, b) => (a.t || 0) - (b.t || 0));
  S.replay = { rows: ok, i: 0 };
  return S;
}
function detachClimate(S) { S.replay = null; return S; }

// ---------------------------------------------------------------------------
// diagnose: plain-English problems and near-misses (for the "Ask Quinn" button)
// ---------------------------------------------------------------------------
/* v65 (play-test #17 M1, critic round 14): Prune refuses a seedling ("no leaves to spare yet"), so a seedling is never told to prune; the damp-air advice keeps the leaves dry instead */
function seedlingSafe(S, list) {
  if (!S || S.stage >= 1 || !Array.isArray(list)) return list;
  const fx = t => typeof t === 'string' ? t.replace(/prune (the )?lower leaves( for airflow)?/gi, m => (m.charAt(0) === 'P' ? 'K' : 'k') + 'eep the leaves dry') : t;
  list.forEach(d => { d.fix = fx(d.fix); d.say = fx(d.say); if (d.act === 'prune') d.act = null; if (d.fix === 'prune') d.fix = ''; });
  return list;
}
function diagnose(S) {
  const s = stageOf(S), su = S.setup, out = [], lit = S.lit, tb = lit ? s.tempDay : s.tempNight;
  const ecT = r2(ecTotal(S)), nm = s.name, rg = a => a[0] + '-' + a[1];
  const add = (id, title, why, fix, hint, sev) => out.push({ id: id, title: title, why: why, fix: fix, productHint: hint || '', severity: sev });
  const chk = (id, title, x, lo, hi, m, unit, what, lowWhy, hiWhy, lowFix, hiFix, lowHint, hiHint) => {
    if (x >= lo && x <= hi) return;
    const d = x < lo ? lo - x : x - hi, sev = d > 2 * m ? 3 : d > m ? 2 : 1, low = x < lo;
    add(id, title, what + ' ' + r2(x, unit === '%' ? 0 : 1) + (unit === '%' ? '%' : unit === 'C' ? 'C' : unit === 'kPa' ? ' kPa' : unit === 'mS' ? ' mS' : '') + ' is ' + (low ? 'below' : 'above') + ' the ' + rg([lo, hi]) + (unit === '%' ? '%' : unit === 'C' ? 'C' : unit === 'kPa' ? ' kPa' : unit === 'mS' ? ' mS' : '') + ' target for ' + nm + '. ' + (low ? lowWhy : hiWhy), (low ? lowFix : hiFix), low ? lowHint : hiHint, sev);
  };
  const humMode = su.humMode, humOn = humMode === 'humidify', dehumOn = humMode === 'dehumidify';
  // Never tell the player to switch on an appliance that is already running: point at the next lever instead.
  const cool = coolLit(S); /* v63 (critic round 12 #3): in a tent that is already cooler than the band, dimming the lights would chill it further, so dry-air fixes do not say it */
  const fanDry = fanHelpsDry(S); /* v60 (play-test #14 #3): "lower the fan" only where a slower fan really makes the air less thirsty (not under a lamp) */
  const dryFix = humOn ? (fanDry ? 'Fix: the humidifier is already on, so lower the fan speed to keep the moisture in.' : lit && !cool ? 'Fix: the humidifier is on; shorten the light hours a little so the air is less thirsty.' : lit ? 'Fix: the humidifier is on and the tent is cool, so leave the lights and give it time.' : 'Fix: the humidifier is on and the fan is low; a bigger humidifier or a wet towel in the tent helps.')
    : fanDry ? 'Fix: lower the fan or turn the Mist on.' : 'Fix: turn the Mist on.'; /* v66 (play-test #18 m5): the dock button is Mist */
  const dampFix = cool ? (dehumOn ? 'Fix: the dehumidifier is on and the tent is cool, so keep the fan down and prune the lower leaves.' : humOn ? 'Fix: the tent is cool, so keep the fan down and prune the lower leaves.' : 'Fix: the tent is cool, so run a dehumidifier rather than more fan.') /* v64 (critic round 13 #2): the cold-air fix says lower the fan */
    : humOn ? (su.fanM3h < 450 ? 'Fix: raise the fan speed. The Mist has switched itself off at this humidity, so the damp is coming from the plants.' : 'Fix: the fan is on High and the Mist is idle, so prune the lower leaves or run a dehumidifier.') /* v64 (critic round 13 #4): over the band top the hygrostat has already stopped, so Mist off would change nothing */ /* v63 (play-test #16 #6): Mist is a hygrostat since v60, so the fan comes first; telling the player to switch it off made the advice flip On and Off */
    : dehumOn ? (su.fanM3h < 450 ? 'Fix: the dehumidifier is already on, so raise the fan speed to pull the damp air out.' : 'Fix: dehumidifier and fan are both flat out; prune lower leaves and keep the tank lid on.')
    : su.fanM3h >= 450 ? 'Fix: the fan is already on High, so run a dehumidifier or prune the lower leaves.' : 'Fix: raise the fan speed or run a dehumidifier.';
  const dryFix2 = dehumOn ? 'Fix: the dehumidifier is drying the tent out. Tap Mist until it reads Off.' : dryFix;
  const dryHint = humOn ? 'Fan speed controller' : dehumOn ? 'Thermo-hygrometer' : 'Humidifier', dampHint = humOn ? 'Thermo-hygrometer' : dehumOn ? 'Fan' : 'Dehumidifier';
  chk('rh', 'Humidity', S.rh, s.rh[0], s.rh[1], 8, '%', 'Humidity', 'Dry air makes plants close their pores and slows growth.', 'Damp air invites grey mould and stops plants moving water and calcium.',
    dryFix2, dampFix, dryHint, dampHint);
  chk('vpd', 'Air dryness (VPD)', S.vpd, s.vpd[0], s.vpd[1], 0.3, 'kPa', 'VPD', 'The air is too damp for plants to pull water up well.', 'The air is thirsty, so plants close their pores and slow down.',
    cool ? (humOn ? 'Fix: the tent is cool, so keep the fan down and tap Humidity until it reads Off.' : dehumOn ? 'Fix: the dehumidifier is on and the tent is cool, so keep the fan down and prune the lower leaves.' : 'Fix: the tent is cool, so run a dehumidifier rather than more fan.') : humOn ? (su.fanM3h < 450 ? 'Fix: raise the fan speed. The Mist has switched itself off at this humidity, so the damp is coming from the plants.' : 'Fix: the humidifier is making the air damp. Tap Mist until it reads Off.') : dehumOn ? 'Fix: the dehumidifier is on; run the fan harder or cool the tent.' : 'Fix: run the fan harder or a dehumidifier, or cool the tent.',
    humOn ? (fanDry ? (cool ? 'Fix: the humidifier is on; lower the fan.' : 'Fix: the humidifier is on; lower the fan or shorten the light hours.') /* v64 (critic round 13 #1) */ : (cool ? 'Fix: the humidifier is on and the tent is cool, so leave the lights and give it time.' : 'Fix: the humidifier is on; shorten the light hours a little.')) : fanDry ? (cool ? 'Fix: lower the fan or turn the Mist on.' : 'Fix: lower the fan, turn the Mist on, or shorten the light hours.') : cool ? 'Fix: turn the Mist on.' : 'Fix: turn the Mist on or shorten the light hours.', dampHint, dryHint);
  chk('temp', 'Air temperature', S.airT, tb[0], tb[1], 3, 'C', 'Air temperature', 'Cold slows growth and fruit set.', 'Heat stalls growth and drops flowers.',
    /* v61 (play-test #15 #1): the old lights-longer answer was said with the lights already on their longest day (and more hours do not warm a lit tent); now the answer is the lever that is left, or the plain truth */
    su.fanM3h > 150 ? 'Fix: lower the fan speed to keep the lamp heat in.' : photoperiod(S) < s.photoperiod ? 'Fix: the fan is already low, so tap Lights until it reads ' + s.photoperiod + 'h or more for more warm hours.' /* v64 (critic round 12 nit #5): the cycle can pass a longer day on the way, and that one is warmer still */ : 'Fix: the fan is already low and the lights are on their full day. The tent runs cool for this crop, so it grows a bit slower.', su.fanM3h >= 450 ? 'Fix: the fan is already on High, so shorten the light hours or run them at night only.' : 'Fix: raise the fan speed, shorten the light hours or run them at night only.', 'Heater / heat mat', 'Fan speed controller');
  chk('ec', 'Nutrient strength', ecT, s.ec[0], s.ec[1], 0.5, 'mS', S.pot ? 'Feed EC' : 'Tank EC', 'The plants are underfed.', S.pot ? 'The feed is too strong and can burn roots.' : 'The solution is too strong and can burn roots.',
    S.pot ? 'Fix: feed stronger at the next watering.' : 'Fix: mix more nutrients into the tank.', S.pot ? 'Fix: water with plain water to flush the pots.' : 'Fix: top up with plain water, or change the tank if it is well above target.', /* v52 (critic round 6 #3): pots have no tank */ 'EC meter', 'EC meter');
  chk('ph', 'pH', S.ph, s.ph[0], s.ph[1], 0.3, 'pH', S.pot ? 'Water pH' : 'Tank pH', 'Acid solution locks out calcium and magnesium.', 'High pH locks out iron, so new leaves yellow.',
    'Fix: add a little pH up.', 'Fix: add a little pH down (about 1 ml per 10 L drops it 0.35).', 'pH Up', 'pH Down'); // [M-x] v44
  chk('wtemp', 'Water temperature', S.wT, s.rootTemp[0], s.rootTemp[1], 2.5, 'C', 'Tank temperature', 'Cold roots drink slowly.', 'Warm water holds little oxygen and breeds root rot.',
    'Fix: move the tank somewhere warmer.', S.airT < s.tempDay[0] ? 'Fix: shade the tank or add an air pump. Keep the fan low, the air is already cool.' : 'Fix: shade the tank, run the fan harder or add an air pump.', 'Heater / heat mat', 'Air pump');
  if (S.resL < 0.4 * S.cap) add('water', 'Tank level', 'Only ' + r2(S.resL, 1) + ' L of ' + r2(S.cap, 0) + ' L is left, so the nutrient mix gets strong and plants may go dry.', 'Fix: top up with plain water.', 'Larger reservoir', S.resL < 0.2 * S.cap ? 3 : 1);
  if (S.do2 < 6) add('oxygen', 'Dissolved oxygen', 'Oxygen is ' + r2(S.do2, 1) + ' mg/L, under 6. Low oxygen in warm water leads to root rot.', 'Fix: add an air pump or cool the tank.', 'Air pump', S.do2 < 4.5 ? 2 : 1);
  if (S.dliLast > 0 && (S.dliLast < s.dli[0] * 0.9 || S.dliLast > s.dli[1] * 1.3) && !(S.stage < 1 && !(su.meters || {}).par)) { /* v66 (critic round 15 m2): no Daily light answer for a seedling the player has no light meter for; it argued with the lesson's Lights step */ const lowL = S.dliLast < s.dli[0]; add('light', 'Daily light', 'Yesterday plants got ' + r2(S.dliLast, 1) + ' mol/m2 of light against ' + rg(s.dli) + '. ' + (lowL ? 'Too little light means slow, leggy growth.' : 'Too much light adds heat and stress.'), lowL ? (photoperiod(S) < 18 ? 'Fix: tap Lights for a longer day.' : 'Fix: the lights are on their longest day, so this lamp is a little weak for this crop.') : photoperiod(S) > 12 ? 'Fix: tap Lights for a shorter day.' : 'Fix: the lights are on their shortest day, so this lamp is just strong for this crop. It does little harm.', '', 1); } /* v65 (critic round 14 minor 2): the Lights button sets the hours (18, 14, 12); there is no dimmer, so the fix names the hours */
  // named problems already flagged by the simulation (skip ones covered above)
  const done = {}; out.forEach(o => { done[o.id] = 1; });
  const P = S.pr;
  if (P.botrytis) add('botrytis', 'Grey mould risk', 'Air has stayed too humid, so grey mould is starting on leaves and stems.', humOn || dehumOn ? dampFix : 'Fix: raise the fan speed, run a dehumidifier or prune lower leaves.', humMode === 'dehumidify' ? 'Fan' : 'Dehumidifier', P.botrytis);
  const CD = CROP_DATA[S.cropId];
  if (P.tip) add('tip', 'Tipburn', 'Inner leaf edges are browning because calcium cannot keep up with fast growth. Strong feed, dry or stale air and too much light make it worse.', 'Fix: ease the light, raise the fan, keep EC in range and add Cal-Mag.', 'Cal-Mag supplement', P.tip);
  if (P.bolt) add('bolt', 'Bolting', 'Air above ' + CD.boltT + 'C is sending the lettuce up to flower, which makes it bitter.', 'Fix: raise the fan speed or shorten the light hours. A chiller helps in summer.', 'Chiller', P.bolt);
  if (P.dm) add('dm', 'Downy mildew', 'Humidity above 85% lets mildew spores spread: yellow patches on top, grey fuzz underneath.', dehumOn ? 'Fix: raise the fan and thin the lower leaves. A pest spray will not cure it.' : 'Fix: dehumidify, raise the fan and thin the lower leaves. A pest spray will not cure it.', dehumOn ? 'Fan' : 'Dehumidifier', P.dm); // [M-H]
  if (P.pm) add('pm', 'Powdery mildew', 'Humid, mild, still air is growing white powder on the leaves. They do not need to be wet.', dehumOn ? 'Fix: raise the fan, thin old leaves and spray milk (1 part to 9 of water).' : 'Fix: raise the fan, dehumidify, thin old leaves and spray milk (1 part to 9 of water).', dehumOn ? 'Fan' : 'Dehumidifier', P.pm); // [M-H]
  if (P.bit) add('bit', 'Bitter, misshapen fruit', 'Strong feed, drought or heat is stressing the vines.', 'Fix: keep EC in range, never let the tank run low and cool the tent.', 'EC meter', P.bit);
  if (P.heat) add('heatdrop', 'Heat stress', 'Air above ' + (CD.heatT || 29) + 'C is killing pollen so flowers drop.', 'Fix: raise the fan speed or cut the light hours.', su.fanM3h >= 450 ? 'Fan' : 'Fan speed controller', P.heat);
  if (P.dryair) add('dryair', 'Very dry air', 'The air is very dry (high VPD, how thirsty the air is), so pores shut and leaf edges crisp.', humOn ? (fanHelpsDry(S) ? 'Fix: the humidifier is on; turn the fan down.' : cool ? 'Fix: the humidifier is on and the tent is cool, so leave the lights and give it time.' : 'Fix: the humidifier is on; shorten the light hours a little.') : fanHelpsDry(S) ? 'Fix: turn the Mist on or turn the fan down.' : cool ? 'Fix: turn the Mist on.' : 'Fix: turn the Mist on or shorten the light hours.', dryHint, P.dryair);
  if (P.iron && !done.ph) add('iron', 'Iron lockout', 'pH has been above ' + CROP_DATA[S.cropId].fe + ' for a while so new leaves go yellow.', S.ph <= stageOf(S).ph[1] ? 'Fix: the pH is back in range, so the new leaves will come in green. Give it a few days.' /* v63 (play-test #16 #5): it said lower the pH with the pH already in or under the band */ : S.pot ? 'Fix: lower pH with pH down.' : 'Fix: lower pH with pH down, or change the tank.', 'pH Down', P.iron); /* v52: pots have no tank */ // [M-x] v44
  if (P.ecburn && !done.ec) add('ecburn', 'EC burn', 'The tank has been too strong; tips scorch and roots struggle.', 'Fix: top up with plain water or change the tank.', 'EC meter', P.ecburn);
  if (P.lowec && !done.ec) add('lowec', 'Hungry plants', 'Nutrients have been too low for this stage, so leaves pale and growth stalls.', 'Fix: mix nutrients.', 'Nutrient line', P.lowec);
  if (P.rot && !done.oxygen) add('rot', 'Root rot risk', 'Warm solution with low oxygen is breeding Pythium.', 'Fix: change the tank, add an air pump and cool the water.', 'Air pump', P.rot);
  if (P.ber) add('ber', 'Blossom end rot', 'Fruit bottoms are going black because calcium is not reaching the fruit.', 'Fix: keep EC and humidity steady, hold pH in range and add Cal-Mag.', 'Cal-Mag supplement', P.ber);
  if (S.out) OUT_IDS.forEach(k => { if (P[k] && OUTP[k].crops.indexOf(S.cropId) >= 0) { const n = OUTP[k]; add(k, n.title, n.see + ' ' + n.cause, n.fix, '', P[k]); } }); // [M-OUT]
  NEW_KEYS.forEach(k => { if (P[k] && NEWP[k].crop === S.cropId) { const n = NEWP[k]; add(k, n.title, n.why, (k === 'greymould' || k === 'slugbite') && (humOn || dehumOn) ? dampFix : n.fix, n.hint, P[k]); } });
  if (P.cold) add('cold', 'Cold stall', 'Air below ' + (CD.coldT || 15) + 'C or water below ' + (CD.coldW || 16) + 'C has stalled growth.', 'Fix: slow the fan and run the lights.', 'Heater / heat mat', P.cold);
  if (P.crack) add('crack', 'Fruit cracking', 'Uneven watering is splitting the skins: the plant drinks in gulps and the fruit swells in fits.', S.pot ? 'Fix: water little and often, never one big drink after a dry spell.' : 'Fix: keep the tank topped up and the feed steady so the plant drinks evenly.', '', P.crack); // [M-H]
  if (S.pestLevel >= 0.5) add('pests', 'Pests', 'Spider mites and thrips are breeding, often in hot dry air.', 'Fix: spray neem oil, and again in 5 days.', 'Pest spray (ask in store)', S.pestLevel < 1.5 ? 1 : S.pestLevel < 2.5 ? 2 : 3);
  /* v68 (story review round 16 minor 3): meters drift a little every day and nothing said so; once a meter is well off and it is five days since the last re-zero, Axel says to calibrate (only where the pH cal button exists: soil and coco read true and have none; v69 critic round 17 m1) */
  { const mt = (S.setup && S.setup.meters) || {}, d = S.drift || {}; if (actionsFor(S).indexOf('calibrate') >= 0 && (mt.ec || mt.ph) && ((mt.ec && Math.abs(d.ec || 0) >= 0.12) || (mt.ph && Math.abs(d.ph || 0) >= 0.2)) && S.day - (S.calDay || 0) >= 5) out.push({ id: 'calibrate', title: 'Meters need a re-zero', why: 'Meters drift a little every day. After a week or two the readings can be off by enough to steer you wrong.', fix: 'calibrate', act: 'calibrate', say: 'Your meters have drifted. Tap pH cal to re-zero them.', productHint: null, severity: 1 }); }
  /* v69 (play-test #20 m2): rank by what the plant feels: an entry whose factor is holding health down (S.lastF) is raised, so an amber pH at factor 0.4 is answered before a mild air reading */
  { const F = S.lastF || {}, K = { ph: 'ph', iron: 'ph', ec: 'ec', lowec: 'ec', temp: 't', rh: 'vpd', vpd: 'vpd', water: 'w', moisture: 'w', oxygen: 'o2' }; out.forEach(o => { const v = F[K[o.id]]; if (typeof v === 'number') o.severity = Math.max(o.severity, v < 0.5 ? 3 : v < 0.8 ? 2 : o.severity); }); }
  /* v69 (critic round 17 m2): Pick it now sits here so the tent hydro tub (which skips adaptDiagnose) gets it too */
  { const HC = CROP_DATA[S.cropId], P0 = S.pr || {}; if (!S.cropDone && HC && HC.harvest === 'once' && ripeKg(S) >= 0.1 && ((P0.bolt || 0) >= 1 || (P0.tip || 0) >= 2)) { for (let k = out.length - 1; k >= 0; k--) if (out[k].id === 'light') out.splice(k, 1); out.push({ id: 'pickNow', title: 'Pick it now', why: 'The heat is pushing it to bolt and burn the leaf tips. It is big enough, so pick it before it turns bitter.', fix: 'harvest', act: 'harvest', say: (P0.bolt || 0) >= 1 ? 'It is starting to bolt. Pick it now, before it turns bitter.' : 'The leaf tips are burning. Pick it now, while it is good.', productHint: null, severity: 3 }); } } /* v71 (critic round 18 nit 3): a tipburn-only trigger is not called bolting */ /* v68 (story review minor 1): a waiting lettuce on a hot veranda bolted under its floor; once it is big enough the first answer is to pick, and a take-the-shade-off light answer no longer argues with the shade-on tipburn answer */
  out.sort((a, b) => b.severity - a.severity);
  return isLegacy(S) ? out : adaptDiagnose(S, out);
}

// UI-facing crop list. days = total game days seed to done; difficulty 1 easy..3 hard; icon = key understood by Art.fruitIcon();
// leafMax = suggested divisor for sqrt(readings.plant.leafArea / leafMax) -> Art.plant size (default tent).
// v57 (Command Centre, play-test #12 #5): when a crop can be picked and when it is full size, read from the stage table, so the copy never
// contradicts an early Pick. start[i] = the game day stage i begins (Day 1 = planting). A leafy crop can be picked once its third stage
// begins (lettuce heading, basil cutting: ripeKg passes 0.02 kg then) and is full size when its fourth begins (lettuce harvest).
// v58 (play-test #13 #2): would a Mix feed at this strength add anything? (the same sum the 'mix' action makes; ui.js only lights the Mix feed glow when it would)
function mixAdds(S, mlPerL) {
  if (!S || S.pot || !(S.resL >= 0.5)) return false;
  const target = ecForMl(clamp(+mlPerL || 0, 0, 12));
  return target * S.resL - S.inertL > S.nutL + 1e-6;
}
const PICK_LAG = 2;
function cropTiming(id) {
  const C = CROP_DATA[id]; if (!C || !C.stages) return null;
  let d = 1; const start = C.stages.map(s => { const x = d; d += s.days; return x; });
  /* v58 (play-test #13 #7): the pick day is when a well-kept head first passes the 0.02 kg pick weight, about two days into the heading stage
     (lettuce: heading Day 18, pickable Day 19 in a hydro tank and Day 20 on a tower; tests/v58.test.js runs the sim and checks this), not the
     day the stage starts */
  return { start: start, end: d - 1, pick: C.leafy ? start[Math.min(2, start.length - 1)] + PICK_LAG : null, full: C.leafy ? start[Math.min(3, start.length - 1)] : null };
}
const LETTUCE_T = cropTiming('lettuce');
const CROPS = [
  { id: 'tomato', name: 'Tomato (cherry)', blurb: 'The classic. Hungry, thirsty and a bit fussy about calcium.', difficulty: 2, icon: 'tomato', harvest: 'multi', leafy: false },
  { id: 'chilli', name: 'Chilli', blurb: 'Loves heat and light. Slow but tough.', difficulty: 3, icon: 'chilli', harvest: 'multi', leafy: false },
  { id: 'capsicum', name: 'Sweet capsicum', blurb: 'Big blocky bells that go green to red. Hates heat spikes and thirsty swings.', difficulty: 3, icon: 'capsicum', harvest: 'multi', leafy: false },
  { id: 'strawberry', name: 'Strawberry', blurb: 'Small plants, sweet reward. Likes it cool and not too humid.', difficulty: 2, icon: 'strawberry', harvest: 'multi', leafy: false },
  { id: 'lettuce', name: 'Butterhead lettuce', blurb: 'Pick from about Day ' + LETTUCE_T.pick + ', full size by Day ' + LETTUCE_T.full + ' in a tent (later outside). Keep it cool or it bolts, and watch for tipburn.', difficulty: 1, icon: 'lettuce', harvest: 'once', leafy: true },
  { id: 'basil', name: 'Sweet basil', blurb: 'Cut it and it grows back. Hates cold nights and damp air.', difficulty: 2, icon: 'basil', harvest: 'cut', leafy: true },
  { id: 'cucumber', name: 'Lebanese cucumber', blurb: 'Fast climbing vine with a heavy crop. Mind the mildew and the feed strength.', difficulty: 2, icon: 'cucumber', harvest: 'multi', leafy: false }
].map(c => { const d = CROP_DATA[c.id]; c.days = d.stages.reduce((a, x) => a + x.days, 0); c.stageNames = d.stages.map(x => x.name); c.plantsInDefaultTent = Math.max(1, Math.round(defaultSetup().tent.area_m2 * d.plantsPerM2)); c.leafMax = d.leafMaxUI; c.noun = d.noun || 'fruit'; c.yieldTargetKg = r2(d.yieldTarget * c.plantsInDefaultTent, 2); return c; });

// [M-H] the numbers copy may quote (almanac, growers, beginner, ui): derived from the crop data where it has them, so the words cannot drift from the game
const FACTS = (function () {
  const ph = {}; Object.keys(CROP_DATA).forEach(k => { const c = CROP_DATA[k]; if (!c || !c.stages) return; ph[k] = [Math.min.apply(null, c.stages.map(x => x.ph[0])), Math.max.apply(null, c.stages.map(x => x.ph[1]))]; });
  return { phWindow: ph, rootTemp: [18, 21], cucumberHeat: CROP_DATA.cucumber.heatT, basilCut: 'a third', basilCutFrac: CROP_DATA.basil.cutFrac, tapEC: CROP_DATA.nutrients.professors.waterEC,
    basilOutdoorWindow: 'Sep to Apr', neemKnockback: '70 percent', neemRepeatDays: 5, soapRepeatDays: 3 };
})();
w.Sim = { SIM_VERSION: SIM_VERSION, CUT_REGROW_DAYS: CUT_REGROW_DAYS, cropTiming: cropTiming, towerSlots: function (crop) { return slotCount({}, crop); }, mixAdds: mixAdds, fanHelpsDry: fanHelpsDry, coolLit: coolLit, create: create, FACTS: FACTS, CROPS: CROPS, tick: tick, act: act, readings: readings, score: score, stageInfo: stageInfo,
  defaultSetup: defaultSetup, ACTIONS: ACTIONS, ecForMl: ecForMl, mlForEc: mlForEc,
  METHODS: METHODS, ACTIONS_EXTRA: ACTIONS_EXTRA, actionsFor: actionsFor, tilesFor: tilesFor, whyRed: whyRed, slotInfo: slotInfo, gearFor: gearFor, pestPressure: pestPressure,
  serialize: serialize, deserialize: deserialize, attachClimate: attachClimate, detachClimate: detachClimate, diagnose: function (S) { return seedlingSafe(S, diagnose(S)); }, problemLooks: problemLooks, PROBLEM_LOOK_KEYS: LOOK_KEYS.slice(), CROP_PROBLEMS: JSON.parse(JSON.stringify(NEWP)), OUT_PROBLEMS: JSON.parse(JSON.stringify(OUTP)), /* [M-OUT] */
  outdoorTemp: function (S) { return S && S.wx ? outdoorNow(S).T : NaN; }, /* read-only: outside air now, for the weather chip */ version: '2.0' };
})(window);
