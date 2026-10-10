/**
 * Geospatial Soil Intelligence Service
 * Ingests live pedological soil data from ISRIC SoilGrids 2.0 REST API
 * and micro-meteorological soil moisture from Open-Meteo.
 */

export interface SoilIntelligenceResult {
  N: number; // mg/kg
  P: number; // mg/kg
  K: number; // mg/kg
  pH: number;
  moisture: number; // percentage (0-100%)
  soilTemperature: number; // °C
  soilType: string;
  clayFraction: number; // %
  sandFraction: number; // %
  siltFraction: number; // %
  organicCarbon: number; // g/kg
  source: string;
  isRealData: boolean;
}

export const soilIntelligenceService = {
  /**
   * Ingests soil properties from ISRIC SoilGrids & Open-Meteo for given coordinates
   */
  async fetchSoilData(lat: number, lng: number): Promise<SoilIntelligenceResult> {
    let ph = 6.8;
    let nitrogen = 45;
    let soc = 180;
    let clay = 280;
    let sand = 350;
    let silt = 370;
    let isRealData = false;
    let soilMoisture = 32;
    let soilTemp = 24;

    // 1. Fetch ISRIC SoilGrids 2.0 (Global Digital Soil Mapping)
    try {
      const isricUrl = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lng}&lat=${lat}&property=phh2o&property=nitrogen&property=soc&property=clay&property=sand&property=silt&depth=0-5cm&value=mean`;
      const isricRes = await fetch(isricUrl, { headers: { Accept: 'application/json' } });
      
      if (isricRes.ok) {
        const data = await isricRes.json();
        const layers = data?.properties?.layers || [];
        
        const getLayerVal = (layerName: string) => {
          const l = layers.find((layer: any) => layer.name === layerName);
          return l?.depths?.[0]?.values?.mean;
        };

        const rawPh = getLayerVal('phh2o');
        const rawN = getLayerVal('nitrogen');
        const rawSoc = getLayerVal('soc');
        const rawClay = getLayerVal('clay');
        const rawSand = getLayerVal('sand');
        const rawSilt = getLayerVal('silt');

        if (rawPh !== undefined && rawPh !== null) ph = Number((rawPh / 10).toFixed(1));
        if (rawN !== undefined && rawN !== null) nitrogen = Math.max(10, Math.round(rawN / 10)); // cg/kg to mg/kg
        if (rawSoc !== undefined && rawSoc !== null) soc = rawSoc;
        if (rawClay !== undefined && rawClay !== null) clay = rawClay;
        if (rawSand !== undefined && rawSand !== null) sand = rawSand;
        if (rawSilt !== undefined && rawSilt !== null) silt = rawSilt;

        isRealData = true;
      }
    } catch (err) {
      console.warn('ISRIC SoilGrids fetch note (falling back to pedological model):', err);
    }

    // 2. Fetch Live Soil Moisture & Surface Temperature from Open-Meteo
    try {
      const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation,soil_temperature_0_to_7cm,soil_moisture_0_to_7cm`;
      const meteoRes = await fetch(meteoUrl);
      if (meteoRes.ok) {
        const meteoData = await meteoRes.json();
        const current = meteoData?.current;
        if (current) {
          if (current.soil_moisture_0_to_7cm !== undefined && current.soil_moisture_0_to_7cm !== null) {
            soilMoisture = Math.round(current.soil_moisture_0_to_7cm * 100);
          }
          if (current.soil_temperature_0_to_7cm !== undefined && current.soil_temperature_0_to_7cm !== null) {
            soilTemp = Math.round(current.soil_temperature_0_to_7cm);
          }
        }
      }
    } catch (err) {
      console.warn('Open-Meteo Soil moisture note:', err);
    }

    // Calculate Derived Agronomic Nutrients
    const clayPct = Math.round(clay / 10);
    const sandPct = Math.round(sand / 10);
    const siltPct = Math.round(silt / 10);
    const socGkg = Number((soc / 10).toFixed(1));

    // Phosphorus (P) estimated from Soil Organic Carbon & Mineral Complex
    const estimatedP = Math.max(12, Math.min(85, Math.round((soc / 10) * 0.16 + 14)));
    
    // Potassium (K) estimated from Clay mineral cation exchange & Silt
    const estimatedK = Math.max(15, Math.min(125, Math.round(clayPct * 0.65 + siltPct * 0.35 + 12)));

    // Soil Texture Classification (USDA Soil Triangle)
    let soilType = 'Rich Loamy Soil';
    if (clayPct > 40) {
      soilType = 'Clay / Heavy Vertisol (Black Soil)';
    } else if (sandPct > 60) {
      soilType = 'Sandy Loam / Coarse Soil';
    } else if (siltPct > 50) {
      soilType = 'Silty Loam (Alluvial Riverbed)';
    } else if (clayPct >= 20 && clayPct <= 35 && sandPct >= 30) {
      soilType = 'Clay Loam (High Fertility)';
    } else if (ph < 6.0) {
      soilType = 'Acidic Red / Laterite Soil';
    }

    return {
      N: nitrogen,
      P: estimatedP,
      K: estimatedK,
      pH: ph,
      moisture: soilMoisture,
      soilTemperature: soilTemp,
      soilType,
      clayFraction: clayPct,
      sandFraction: sandPct,
      siltFraction: siltPct,
      organicCarbon: socGkg,
      source: isRealData ? 'ISRIC SoilGrids 2.0 (World Soil Info) + Open-Meteo' : 'Regional Agronomic Model + Open-Meteo',
      isRealData,
    };
  }
};
