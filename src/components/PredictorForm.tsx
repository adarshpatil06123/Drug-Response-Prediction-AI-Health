'use client';

import { useState, useMemo, useEffect } from 'react';
import axios from 'axios';

// API Configuration - Use environment variable for production deployment
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// PubChem autocomplete validation URL
const PUBCHEM_VALIDATION_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/Compound/query/';

interface PredictionResult {
  prediction: string;
  confidence: number;
  isRealAI?: boolean;
  isEnhanced?: boolean;
  drugName?: string;
  dosage?: string;
  explanation?: string;
  medicineSuitability?: {
    overall_suitability: {
      status: string;
      score: number;
      color: string;
      recommendation: string;
      confidence: number;
    };
    assessment_factors: Array<{
      factor: string;
      impact: string;
      description: string;
      recommendation: string;
    }>;
    safety_information: {
      warnings: string[];
      interactions: {
        has_interactions: boolean;
        interaction_count: number;
        recommendation: string;
      };
      monitoring_required: boolean;
    };
    personalized_recommendations: string[];
    next_steps: string[];
    emergency_contact: string;
  };
  geneticMarkers?: {
    markerA: string;
    markerB: string;
  } | Array<{
    gene: string;
    genotype: string;
    phenotype: string;
    activityScore: number;
    drugsAffected: string[];
    clinicalSignificance: string;
  }>;
  medicalHistory?: string;
  patientData?: {
    demographics: any;
    vitals: any;
    medicalHistory: string[];
    allergies: any[];
    currentMedications: any[];
  };
  drugInfo?: any;
  clinicalRecommendations?: string[];
  responseTime?: number;
  source?: string;
}

export default function PredictorForm() {
  const [formData, setFormData] = useState({
    medicineName: '',
    gender: '',
    age: 45,
    weight: '',
    height: '',
    chronicConditions: ''
  });

  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDrugInfo, setLoadingDrugInfo] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drugValidation, setDrugValidation] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');

  // Check API status and system status on component mount
  useEffect(() => {
    const checkApiStatus = async () => {
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`${API_BASE_URL}/`, {
          method: 'GET',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const endTime = Date.now();
        setResponseTime(endTime - startTime);
        
        if (response.ok) {
          const data = await response.json();
          console.log('🟢 API Health Check SUCCESS:', data);
          console.log('🚀 Real-time API is AVAILABLE and READY');
          setApiStatus('connected');
          
          // Also fetch system status
          try {
            const statusResponse = await fetch(`${API_BASE_URL}/system-status`);
            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              setSystemStatus(statusData);
              console.log('System Status:', statusData);
            }
          } catch (statusError) {
            console.log('System status check failed:', statusError);
          }
        } else {
          setApiStatus('disconnected');
        }
      } catch (error) {
        const endTime = Date.now();
        setResponseTime(endTime - startTime);
        console.log('API Health Check Failed:', error);
        setApiStatus('disconnected');
      }
    };
    
    checkApiStatus();
  }, []);

  // Dynamic BMI calculation using useMemo
  const calculatedBMI = useMemo(() => {
    const weight = parseFloat(formData.weight);
    const height = parseFloat(formData.height);
    if (weight > 0 && height > 0) {
      const heightInMeters = height / 100; // Convert cm to meters
      const bmi = weight / (heightInMeters * heightInMeters);
      return bmi.toFixed(1);
    }
    return '';
  }, [formData.weight, formData.height]);

  const calculateDosage = (bmi: number): string => {
    // Simple dosage calculation based on BMI
    if (bmi < 18.5) return '100mg daily';
    if (bmi < 25) return '150mg daily';
    if (bmi < 30) return '200mg daily';
    return '250mg daily';
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (name === 'medicineName') {
      setDrugValidation('idle');
      setError(null);
    }
  };

  const handleAgeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    console.log('Age slider changed to:', value);
    setFormData(prev => ({
      ...prev,
      age: value
    }));
  };

  const validateDrugName = async (rawName: string): Promise<boolean> => {
    try {
      const drugName = (rawName || '').trim();
      if (!drugName) {
        setError('Medicine name is required');
        setDrugValidation('invalid');
        return false;
      }
      setDrugValidation('checking');
      const url = `${PUBCHEM_VALIDATION_URL}${encodeURIComponent(drugName)}/json?dict=compound&limit=1`;
      const validationResp = await axios.get(url, { timeout: 5000 });
      const suggestions: string[] = validationResp.data?.dictionary_terms?.compound || [];
      const exactMatch = suggestions.some((s) => s.toLowerCase() === drugName.toLowerCase());
      if (!exactMatch) {
        setError(`Medicine Not Found: The term "${drugName}" is not recognized in primary medical databases. Please check spelling.`);
        setDrugValidation('invalid');
        return false;
      }
      setError(null);
      setDrugValidation('valid');
      return true;
    } catch (err) {
      setError('Unable to validate medicine name right now. Please check the spelling or try again later.');
      setDrugValidation('invalid');
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Pre-submit validation against PubChem autocomplete for exact match
    try {
      const ok = await validateDrugName(formData.medicineName);
      if (!ok) {
        setLoading(false);
        return;
      }
    } catch (e) {
      setLoading(false);
      return;
    }
    
    const startTime = Date.now();
    
    try {
      // Validate required fields
      if (!formData.medicineName.trim()) {
        throw new Error('Medicine name is required');
      }
      if (!formData.gender) {
        throw new Error('Gender is required');
      }
      if (!formData.height || parseFloat(formData.height) <= 0) {
        throw new Error('Valid height is required');
      }
      if (!formData.weight || parseFloat(formData.weight) <= 0) {
        throw new Error('Valid weight is required');
      }
      if (!formData.age || formData.age <= 0 || formData.age > 120) {
        throw new Error('Valid age between 1 and 120 is required');
      }

      console.log('🚀 Starting REAL-TIME prediction for:', formData.medicineName);
      console.log('📊 Form data validation passed:', formData);
      console.log('📊 Age being sent:', formData.age, typeof formData.age);
      
      // Generate unique patient ID
      const patientId = `patient_${Date.now()}`;
      
      // Try enhanced API first
      const enhancedData = {
        patient_id: patientId,
        age: Number(formData.age),
        gender: formData.gender,
        height: parseFloat(formData.height),
        weight: parseFloat(formData.weight),
        drug_name: formData.medicineName.trim(),
        chronic_conditions: formData.chronicConditions || 'None'
      };

      console.log('Trying enhanced API with data:', enhancedData);
      console.log('Enhanced API age:', enhancedData.age, typeof enhancedData.age);

      let response = await fetch(`${API_BASE_URL}/predict/enhanced`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(enhancedData),
      });

      let result;
      let isEnhanced = false;

      console.log('Enhanced API response status:', response.status, response.ok);

      if (response.ok) {
        result = await response.json();
        isEnhanced = true;
        console.log('✅ SUCCESS: Enhanced API Response:', result);
        console.log('✅ Using REAL-TIME AI with Enhanced Analysis');
      } else {
        // Fall back to standard API
        console.log('❌ Enhanced API failed, trying standard API...');
        console.log('Enhanced API error:', response.status, response.statusText);
        
        const standardData = {
          patient_age: Number(formData.age),
          patient_gender: formData.gender,
          patient_height_cm: parseFloat(formData.height),
          patient_weight_kg: parseFloat(formData.weight),
          patient_diagnosis: formData.chronicConditions || 'General Health Assessment',
          drug_name: formData.medicineName
        };

        console.log('Trying standard API with data:', standardData);
        console.log('Standard API age:', standardData.patient_age, typeof standardData.patient_age);

        response = await fetch(`${API_BASE_URL}/predict`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(standardData),
        });

        if (response.ok) {
          result = await response.json();
          console.log('✅ SUCCESS: Standard API Response:', result);
          console.log('✅ Using REAL-TIME AI with Standard Analysis');
        } else {
          console.log('❌ Both APIs failed!');
          console.log('Standard API error:', response.status, response.statusText);
        }
      }

      const endTime = Date.now();
      const predictionTime = endTime - startTime;

      if (response.ok && result) {
        console.log(`🚀 REAL-TIME PREDICTION COMPLETED in ${predictionTime}ms using ${isEnhanced ? 'ENHANCED' : 'STANDARD'} API`);
        console.log('📊 Prediction Result:', result);
        
        // Map API response to frontend format
        const mappedResult = isEnhanced ? 
          mapEnhancedApiResponse(result, predictionTime) : 
          mapStandardApiResponse(result, predictionTime);
        
        // Use API explanation if available, otherwise generate detailed medicine explanation
        if (!mappedResult.explanation) {
          const detailedExplanation = await generateMedicineExplanation(
            mappedResult.drugName || formData.medicineName, 
            mappedResult
          );
          mappedResult.explanation = detailedExplanation;
        } else {
          console.log('✅ Using API-generated explanation:', mappedResult.explanation);
        }
        
        console.log('✅ DISPLAYING REAL-TIME RESULTS');
        console.log('🔍 Final prediction object:', mappedResult);
        console.log('🔍 isRealAI flag:', mappedResult.isRealAI);
        console.log('🔍 isEnhanced flag:', mappedResult.isEnhanced);
        setPrediction(mappedResult);
        setApiStatus('connected');
      } else {
        throw new Error('Both APIs failed');
      }
    } catch (error) {
      console.error('❌ PREDICTION ERROR:', error);
      
      // Check if it's a validation error
      if (error instanceof Error && error.message.includes('required')) {
        console.error('⚠️ VALIDATION ERROR:', error.message);
        alert(`Validation Error: ${error.message}`);
        setLoading(false);
        return;
      }
      
      console.error('❌ ALL REAL-TIME APIs FAILED:', error);
      alert('Unable to connect to AI prediction service. Please check your internet connection and try again.');
      setApiStatus('disconnected');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to map enhanced API response
  const mapEnhancedApiResponse = (result: any, predictionTime: number) => {
    const prediction = result.prediction || {};
    const patientData = result.patient_data || {};
    const geneticProfile = result.genetic_profile || {};
    const drugInfo = result.drug_info || {};
    const recommendations = result.clinical_recommendations || [];

    return {
      prediction: prediction.prediction_label || prediction.prediction || 'Responsive',
      confidence: prediction.confidence || 0.85,
      isRealAI: true,
      isEnhanced: true,
      drugName: formData.medicineName,
      dosage: calculateDosage(parseFloat(calculatedBMI || '25')),
      explanation: result.explanation || result.analysis_summary || 
                   `AI prediction completed in ${predictionTime}ms using real-time patient data, genetic profile, and comprehensive drug information. Confidence: ${Math.round((prediction.confidence || 0.85) * 100)}%. ${prediction.reasoning || ''}`,
      patientData: {
        demographics: patientData.demographics || {},
        vitals: patientData.current_vitals || {},
        medicalHistory: patientData.medical_history || [],
        allergies: patientData.allergies || [],
        currentMedications: patientData.current_medications || []
      },
      geneticMarkers: mapGeneticMarkers(geneticProfile.genetic_markers || {}),
      drugInfo: {
        rxnormData: drugInfo.rxnorm_data || {},
        fdaData: drugInfo.fda_data || {},
        interactions: drugInfo.interactions || {},
        dosageInfo: drugInfo.dosage_info || {}
      },
      clinicalRecommendations: recommendations,
      medicalHistory: patientData.medical_history?.join(', ') || formData.chronicConditions || 'No specific contraindications noted',
      responseTime: predictionTime,
      source: 'enhanced_realtime_api'
    };
  };

  // Helper function to map standard API response
  const mapStandardApiResponse = (result: any, predictionTime: number) => {
    return {
      prediction: result.prediction_label || result.prediction,
      confidence: result.confidence || 0.85,
      isRealAI: true,
      isEnhanced: false,
      drugName: result.drug_name,
      dosage: calculateDosage(result.patient_data?.bmi || parseFloat(calculatedBMI || '25')),
      explanation: result.explanation || result.analysis_summary || generateExplanation(result, predictionTime),
      medicineSuitability: result.medicine_suitability || null,
      geneticMarkers: result.genetic_markers || [],
      medicalHistory: formData.chronicConditions || 'No specific contraindications noted',
      responseTime: predictionTime,
      source: 'standard_api'
    };
  };

  // Helper function to map genetic markers from enhanced API
  const mapGeneticMarkers = (geneticData: any) => {
    const markers = [];
    
    for (const [gene, data] of Object.entries(geneticData)) {
      markers.push({
        gene,
        genotype: (data as any).genotype || 'Unknown',
        phenotype: (data as any).phenotype || 'Unknown',
        activityScore: (data as any).activity_score || 1.0,
        drugsAffected: (data as any).drugs_affected || [],
        clinicalSignificance: getClinicalSignificance((data as any).phenotype)
      });
    }
    
    return markers;
  };

  // Helper function to get clinical significance
  const getClinicalSignificance = (phenotype: string) => {
    if (phenotype.includes('Poor')) return 'High - Requires dose adjustment';
    if (phenotype.includes('Intermediate')) return 'Moderate - Monitor closely';
    if (phenotype.includes('Rapid')) return 'Moderate - May need higher doses';
    return 'Normal - Standard dosing appropriate';
  };

  // Helper function to format explanation text as medicine-focused description
  const formatExplanationText = (text: string, drugName?: string) => {
    if (!text) return 'No explanation available.';
    
    // Extract key information for medicine-focused explanation
    const drugInfo = getDrugInfo(drugName || '');
    
    // Start with medicine name and basic description
    let explanationHtml = `<strong>${drugName || 'This Medicine'}</strong>: `;
    
    // Try to extract specific condition information from the API response
    let specificCondition = '';
    const indicationsMatch = text.match(/(?:How it helps|Indications|INDICATIONS).*?:\s*(.*?)(?=\*\*|$)/s);
    if (indicationsMatch) {
      const indications = indicationsMatch[1].trim();
      // Look for specific disease conditions in the text
      if (indications.toLowerCase().includes('gastroesophageal reflux') || indications.toLowerCase().includes('gerd')) {
        specificCondition = 'Gastroesophageal reflux disease (GERD)';
      } else if (indications.toLowerCase().includes('hypertension')) {
        specificCondition = 'Hypertension (high blood pressure)';
      } else if (indications.toLowerCase().includes('diabetes')) {
        specificCondition = 'Type 2 Diabetes';
      } else if (indications.toLowerCase().includes('depression')) {
        specificCondition = 'Depression and anxiety disorders';
      } else if (indications.toLowerCase().includes('pain')) {
        specificCondition = 'Pain management';
      } else if (indications.toLowerCase().includes('inflammation')) {
        specificCondition = 'Inflammatory conditions';
      } else if (indications.toLowerCase().includes('cholesterol')) {
        specificCondition = 'High cholesterol and cardiovascular risk';
      } else if (indications.toLowerCase().includes('infection')) {
        specificCondition = 'Bacterial infections';
      }
    }
    
    // Use specific condition if found, otherwise use database info
    if (specificCondition) {
      explanationHtml += `${drugInfo.category} commonly prescribed for ${specificCondition}. `;
    } else {
      explanationHtml += `${drugInfo.category} commonly prescribed for ${drugInfo.uses}. `;
    }
    
    // Extract mechanism of action from the text
    const mechanismMatch = text.match(/(?:How it works|Mechanism of Action).*?:\s*(.*?)(?=\*\*|$)/s);
    if (mechanismMatch) {
      const mechanism = mechanismMatch[1].trim();
      if (mechanism && mechanism.length > 10) {
        explanationHtml += `<br/><br/><strong>How it works:</strong> ${mechanism}`;
      }
    }
    
    // Extract indications/uses from the text
    const usesMatch = text.match(/(?:How it helps|Indications).*?:\s*(.*?)(?=\*\*|$)/s);
    if (usesMatch) {
      const indications = usesMatch[1].trim();
      if (indications && indications.length > 10) {
        explanationHtml += `<br/><br/><strong>Used to treat:</strong> ${indications.substring(0, 200)}${indications.length > 200 ? '...' : ''}`;
      }
    }
    
    // Add chemical information if available
    const formulaMatch = text.match(/Chemical Formula.*?:\s*(.*?)(?=\*\*|$)/);
    if (formulaMatch) {
      const formula = formulaMatch[1].trim();
      if (formula) {
        explanationHtml += `<br/><br/><strong>Chemical Formula:</strong> <span style="font-family: monospace;">${formula}</span>`;
      }
    }
    
    // Add safety information if available
    const safetyMatch = text.match(/Safety Assessment.*?:\s*(.*?)(?=\*\*|$)/);
    if (safetyMatch) {
      const safety = safetyMatch[1].trim();
      if (safety && safety.length > 10) {
        explanationHtml += `<br/><br/><strong>Safety:</strong> <span style="color: #059669;">${safety}</span>`;
      }
    }
    
    // Add recommendation if available
    const recommendationMatch = text.match(/Recommendation.*?:\s*(.*?)(?=\*\*|$)/);
    if (recommendationMatch) {
      const recommendation = recommendationMatch[1].trim();
      if (recommendation && recommendation.length > 10) {
        explanationHtml += `<br/><br/><strong>Recommendation:</strong> ${recommendation}`;
      }
    }
    
    return explanationHtml;
  };

  // Function to fetch real-time drug information from multiple sources
  const fetchRealTimeDrugInfo = async (drugName: string) => {
    try {
      // Try backend API first
      const response = await fetch(`${API_BASE_URL}/drug-info/${encodeURIComponent(drugName)}`);
      if (response.ok) {
        const data = await response.json();
        return data.data;
      }
    } catch (error) {
      console.log('Backend drug info not available:', error);
    }

    // Fallback to direct API calls
    try {
      const drugInfo = await fetchDirectDrugAPIs(drugName);
      return drugInfo;
    } catch (error) {
      console.log('Direct API calls failed:', error);
    }

    return null;
  };

  // Function to fetch from direct APIs when backend is not available
  const fetchDirectDrugAPIs = async (drugName: string) => {
    const drugInfo = {
      drug_name: drugName,
      sources: [],
      real_time_data: true
    };

    try {
      // Try RxNorm API (no API key required)
      const rxnormData = await fetchRxNormData(drugName);
      if (rxnormData) {
        drugInfo.rxnorm = rxnormData;
        drugInfo.sources.push('RxNorm');
      }
    } catch (error) {
      console.log('RxNorm API failed:', error);
    }

    try {
      // Try OpenFDA API (no API key required)
      const fdaData = await fetchFDAData(drugName);
      if (fdaData) {
        drugInfo.fda = fdaData;
        drugInfo.sources.push('FDA');
      }
    } catch (error) {
      console.log('FDA API failed:', error);
    }

    try {
      // Try PubChem API for molecular data
      const pubchemData = await fetchPubChemData(drugName);
      if (pubchemData) {
        drugInfo.pubchem = pubchemData;
        drugInfo.sources.push('PubChem');
      }
    } catch (error) {
      console.log('PubChem API failed:', error);
    }

    return drugInfo.sources.length > 0 ? drugInfo : null;
  };

  // Fetch from RxNorm API
  const fetchRxNormData = async (drugName: string) => {
    try {
      const response = await fetch(
        `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(drugName)}`,
        { 
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.drugGroup && data.drugGroup.conceptGroup) {
          const concepts = [];
          for (const group of data.drugGroup.conceptGroup) {
            if (group.conceptProperties) {
              concepts.push(...group.conceptProperties);
            }
          }
          
          if (concepts.length > 0) {
            return {
              found: true,
              concepts: concepts,
              source: 'RxNorm',
              drug_name: drugName,
              total_concepts: concepts.length
            };
          }
        }
      }
    } catch (error) {
      console.log('RxNorm fetch error:', error);
    }
    return null;
  };

  // Fetch from OpenFDA API
  const fetchFDAData = async (drugName: string) => {
    try {
      const response = await fetch(
        `https://api.fda.gov/drug/label.json?search=generic_name:"${encodeURIComponent(drugName)}"&limit=1`,
        { 
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          const result = data.results[0];
          return {
            found: true,
            generic_name: result.generic_name,
            brand_name: result.brand_name,
            indications: result.indications_and_usage,
            warnings: result.warnings,
            dosage: result.dosage_and_administration,
            contraindications: result.contraindications,
            source: 'FDA',
            drug_name: drugName
          };
        }
      }
    } catch (error) {
      console.log('FDA fetch error:', error);
    }
    return null;
  };

  // Fetch from PubChem API
  const fetchPubChemData = async (drugName: string) => {
    try {
      const response = await fetch(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(drugName)}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,IsomericSMILES/JSON`,
        { 
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.PropertyTable && data.PropertyTable.Properties && data.PropertyTable.Properties.length > 0) {
          const props = data.PropertyTable.Properties[0];
          return {
            found: true,
            molecular_formula: props.MolecularFormula,
            molecular_weight: props.MolecularWeight,
            canonical_smiles: props.CanonicalSMILES,
            isomeric_smiles: props.IsomericSMILES,
            source: 'PubChem',
            drug_name: drugName
          };
        }
      }
    } catch (error) {
      console.log('PubChem fetch error:', error);
    }
    return null;
  };

  // Helper function to get drug information from real API data only
  const getDrugInfo = (drugName: string) => {
    // This function now only provides fallback information when no real API data is available
    // Real drug information comes from the backend API calls
    return { 
      category: 'Medication', 
      uses: 'Real-time data from medical databases' 
    };
  };

  const generateExplanation = (apiResult: any, predictionTime?: number): string => {
    const confidence = Math.round((apiResult.confidence || 0.85) * 100);
    const predictionLabel = apiResult.prediction_label || apiResult.prediction;
    const timeInfo = predictionTime ? ` Analysis completed in ${predictionTime}ms using real-time AI processing.` : '';
    const drugInfo = getDrugInfo(apiResult.drug_name || formData.medicineName);
    
    const drugContext = `${drugInfo.category} commonly prescribed for ${drugInfo.uses}`;
    
    if (predictionLabel === 'Effective') {
      return `The AI model analyzed the patient's profile for ${drugContext}. The analysis predicts an effective response with ${confidence}% confidence. Based on the patient's age, BMI, and medical history, the drug is expected to provide therapeutic benefits with minimal adverse effects.${timeInfo}`;
    } else if (predictionLabel === 'Ineffective') {
      return `The AI model analyzed ${drugContext} and predicts limited effectiveness for this medication with ${confidence}% confidence. Alternative treatments or dosage adjustments may be considered based on the patient's specific profile and medical history.${timeInfo}`;
    } else {
      return `The AI model analyzed ${drugContext} and indicates potential risks or adverse effects with ${confidence}% confidence. Close monitoring and consultation with healthcare professionals is recommended for this patient-drug combination.${timeInfo}`;
    }
  };

  const generateMedicineExplanation = async (drugName: string, prediction: PredictionResult): Promise<string> => {
    const drugInfo = getDrugInfo(drugName);
    const patientAge = formData.age;
    const patientConditions = formData.chronicConditions.toLowerCase();
    
    // Set loading state for drug info lookup
    setLoadingDrugInfo(true);
    
    try {
      // Try to get real-time drug information from backend
      const realTimeInfo = await fetchRealTimeDrugInfo(drugName);
    
    // Comprehensive medicine-specific information database
    const medicineData: { [key: string]: { uses: string; effects: string; precautions: string; } } = {
      // Cardiovascular Medications
      'lisinopril': {
        uses: 'Lisinopril is an ACE inhibitor used to treat high blood pressure and heart failure.',
        effects: 'It helps lower blood pressure by relaxing blood vessels, reducing the workload on your heart and improving blood flow.',
        precautions: 'Monitor for dizziness, dry cough, and elevated potassium levels. Avoid pregnancy and consult your doctor if you experience swelling.'
      },
      'enalapril': {
        uses: 'Enalapril is an ACE inhibitor used to treat high blood pressure and heart failure.',
        effects: 'It works by blocking the conversion of angiotensin I to angiotensin II, relaxing blood vessels and reducing blood pressure.',
        precautions: 'Monitor for dry cough, dizziness, and elevated potassium levels. Avoid during pregnancy.'
      },
      'losartan': {
        uses: 'Losartan is an ARB (Angiotensin Receptor Blocker) used to treat high blood pressure and heart failure.',
        effects: 'It blocks angiotensin II receptors, relaxing blood vessels and reducing blood pressure without causing dry cough.',
        precautions: 'Monitor for dizziness and elevated potassium levels. Avoid during pregnancy.'
      },
      'metoprolol': {
        uses: 'Metoprolol is a beta-blocker used to treat high blood pressure, heart rhythm disorders, and heart failure.',
        effects: 'It slows heart rate and reduces blood pressure by blocking beta-adrenergic receptors.',
        precautions: 'Do not stop suddenly. Monitor for fatigue, cold hands/feet, and breathing problems in asthma patients.'
      },
      'amlodipine': {
        uses: 'Amlodipine is a calcium channel blocker used to treat high blood pressure and chest pain (angina).',
        effects: 'It relaxes blood vessels by blocking calcium channels, improving blood flow and reducing blood pressure.',
        precautions: 'Monitor for swelling in ankles/feet, dizziness, and flushing. May cause gum overgrowth.'
      },
      'corvadil': {
        uses: 'Corvadil is a calcium channel blocker used to treat high blood pressure and chest pain (angina).',
        effects: 'It relaxes blood vessels by blocking calcium channels, improving blood flow and reducing blood pressure.',
        precautions: 'Monitor for swelling in ankles/feet, dizziness, and flushing. May cause gum overgrowth.'
      },
      'warfarin': {
        uses: 'Warfarin is an anticoagulant (blood thinner) used to prevent blood clots.',
        effects: 'It blocks vitamin K-dependent clotting factors, reducing the risk of stroke and blood clots.',
        precautions: 'Requires regular blood tests (INR). Avoid alcohol and certain foods. Watch for bleeding signs.'
      },
      
      // Diabetes Medications
      'metformin': {
        uses: 'Metformin is an antidiabetic medication used to control blood sugar levels in type 2 diabetes.',
        effects: 'It helps lower blood glucose by reducing glucose production in the liver and improving insulin sensitivity.',
        precautions: 'Take with food to reduce stomach upset. Monitor for signs of lactic acidosis and kidney function regularly.'
      },
      'insulin': {
        uses: 'Insulin is a hormone used to control blood sugar levels in diabetes.',
        effects: 'It helps glucose enter cells for energy, lowering blood sugar levels.',
        precautions: 'Monitor blood sugar regularly. Watch for signs of low blood sugar (hypoglycemia).'
      },
      'glipizide': {
        uses: 'Glipizide is a sulfonylurea used to treat type 2 diabetes.',
        effects: 'It stimulates the pancreas to release more insulin, helping lower blood sugar.',
        precautions: 'Take 30 minutes before meals. Monitor for low blood sugar and weight gain.'
      },
      
      // Pain Relief Medications
      'ibuprofen': {
        uses: 'Ibuprofen is a nonsteroidal anti-inflammatory drug (NSAID) used to reduce pain, fever, and inflammation.',
        effects: 'It works by blocking enzymes that produce prostaglandins, substances that cause pain and inflammation.',
        precautions: 'Take with food to prevent stomach irritation. Avoid long-term use and monitor for gastrointestinal bleeding or kidney problems.'
      },
      'paracetamol': {
        uses: 'Paracetamol (Acetaminophen) is an analgesic and antipyretic used for pain relief and fever reduction.',
        effects: 'It reduces pain and fever by affecting pain receptors and the brain\'s temperature control center.',
        precautions: 'Do not exceed recommended dose to prevent liver damage. Avoid alcohol consumption while taking this medication.'
      },
      'aspirin': {
        uses: 'Aspirin is an NSAID and antiplatelet medication used for pain relief and cardiovascular protection.',
        effects: 'It reduces pain and inflammation while preventing blood clots by blocking platelet aggregation.',
        precautions: 'Take with food. Avoid in children with viral infections. Monitor for stomach irritation and bleeding.'
      },
      'tramadol': {
        uses: 'Tramadol is an opioid analgesic used for moderate to severe pain management.',
        effects: 'It works by binding to opioid receptors and inhibiting serotonin and norepinephrine reuptake.',
        precautions: 'Risk of addiction and dependence. Avoid alcohol. Monitor for respiratory depression and seizures.'
      },
      
      // Cholesterol Medications
      'atorvastatin': {
        uses: 'Atorvastatin is a statin medication used to lower cholesterol and reduce cardiovascular risk.',
        effects: 'It works by blocking cholesterol production in the liver, helping to prevent heart disease and stroke.',
        precautions: 'Monitor liver function and watch for muscle pain or weakness. Avoid grapefruit juice which can increase drug levels.'
      },
      'simvastatin': {
        uses: 'Simvastatin is a statin medication used to lower cholesterol and reduce cardiovascular risk.',
        effects: 'It inhibits HMG-CoA reductase, reducing cholesterol production in the liver.',
        precautions: 'Take in the evening. Monitor liver function and muscle symptoms. Avoid grapefruit juice.'
      },
      'rosuvastatin': {
        uses: 'Rosuvastatin is a statin medication used to lower cholesterol and reduce cardiovascular risk.',
        effects: 'It is a potent statin that effectively reduces LDL cholesterol and triglycerides.',
        precautions: 'Monitor liver function and muscle symptoms. May cause protein in urine at high doses.'
      },
      
      // Gastrointestinal Medications
      'omeprazole': {
        uses: 'Omeprazole is a proton pump inhibitor used to treat acid reflux and stomach ulcers.',
        effects: 'It blocks the final step of acid production in the stomach, providing long-lasting acid suppression.',
        precautions: 'Take before meals. Long-term use may increase risk of bone fractures and vitamin B12 deficiency.'
      },
      'lansoprazole': {
        uses: 'Lansoprazole is a proton pump inhibitor used to treat acid reflux and stomach ulcers.',
        effects: 'It reduces stomach acid production by blocking the proton pump in stomach cells.',
        precautions: 'Take before meals. Monitor for vitamin B12 deficiency with long-term use.'
      },
      
      // Antibiotics
      'amoxicillin': {
        uses: 'Amoxicillin is a penicillin antibiotic used to treat bacterial infections.',
        effects: 'It kills bacteria by interfering with their cell wall synthesis.',
        precautions: 'Complete the full course even if feeling better. Watch for allergic reactions and diarrhea.'
      },
      'azithromycin': {
        uses: 'Azithromycin is a macrolide antibiotic used to treat bacterial infections.',
        effects: 'It stops bacterial growth by interfering with protein synthesis.',
        precautions: 'Take as directed. May cause stomach upset. Avoid if allergic to macrolides.'
      },
      
      // Mental Health Medications
      'sertraline': {
        uses: 'Sertraline is an SSRI antidepressant used to treat depression and anxiety disorders.',
        effects: 'It increases serotonin levels in the brain, improving mood and reducing anxiety.',
        precautions: 'May take 4-6 weeks to work. Monitor for suicidal thoughts, especially in young adults.'
      },
      'fluoxetine': {
        uses: 'Fluoxetine is an SSRI antidepressant used to treat depression, anxiety, and OCD.',
        effects: 'It blocks serotonin reuptake, increasing serotonin levels in the brain.',
        precautions: 'Long half-life means effects persist after stopping. Monitor for mood changes.'
      },
      
      // Respiratory Medications
      'albuterol': {
        uses: 'Albuterol is a bronchodilator used to treat asthma and COPD.',
        effects: 'It relaxes airway muscles, making breathing easier during asthma attacks.',
        precautions: 'Use as needed for symptoms. Overuse may cause tremors and increased heart rate.'
      },
      'prednisone': {
        uses: 'Prednisone is a corticosteroid used to reduce inflammation and suppress the immune system.',
        effects: 'It mimics cortisol, reducing inflammation and immune system activity.',
        precautions: 'Do not stop suddenly. Monitor for mood changes, weight gain, and increased infection risk.'
      },
      
      // Thyroid Medications
      'levothyroxine': {
        uses: 'Levothyroxine is a thyroid hormone replacement used to treat hypothyroidism.',
        effects: 'It replaces missing thyroid hormone, restoring normal metabolism and energy levels.',
        precautions: 'Take on empty stomach. Monitor thyroid function regularly. Avoid certain foods and medications.'
      }
    };

    const drug = drugName.toLowerCase();
    let medicineInfo = medicineData[drug];
    
    // Prioritize real-time drug information over static data
    if (realTimeInfo && realTimeInfo.real_time_data) {
      console.log('🔄 Using REAL-TIME drug data for:', drugName);
      console.log('📊 Real-time sources:', realTimeInfo.sources);
      console.log('🔍 Full real-time data:', realTimeInfo);
      
      // Use FDA data if available (most comprehensive)
      if (realTimeInfo.fda && realTimeInfo.fda.found) {
        const fdaInfo = realTimeInfo.fda;
        medicineInfo = {
          uses: `${drugName} (${fdaInfo.generic_name || drugName}) is a medication used for ${fdaInfo.indications ? fdaInfo.indications.join(', ') : 'therapeutic treatment'}.`,
          effects: `This medication is approved by the FDA for the treatment of specific medical conditions. ${fdaInfo.dosage ? 'Dosage information: ' + fdaInfo.dosage.join(', ') : ''}`,
          precautions: fdaInfo.warnings ? fdaInfo.warnings.join('. ') : fdaInfo.contraindications ? fdaInfo.contraindications.join('. ') : 'Follow your doctor\'s instructions carefully and report any unusual side effects or concerns.'
        };
      }
      // Use RxNorm data if available
      else if (realTimeInfo.rxnorm && realTimeInfo.rxnorm.found) {
        const rxnormInfo = realTimeInfo.rxnorm;
        const primaryConcept = rxnormInfo.concepts[0];
        medicineInfo = {
          uses: `${drugName} is a standardized medication (RxCUI: ${primaryConcept.rxcui}) used for therapeutic treatment.`,
          effects: `This medication is recognized in the RxNorm database with ${rxnormInfo.total_concepts} related concepts.`,
          precautions: 'Follow your doctor\'s instructions carefully and report any unusual side effects or concerns.'
        };
      }
      // Use PubChem data if available
      else if (realTimeInfo.pubchem && realTimeInfo.pubchem.found) {
        const pubchemInfo = realTimeInfo.pubchem;
        medicineInfo = {
          uses: `${drugName} is a chemical compound (Molecular Formula: ${pubchemInfo.molecular_formula}, Molecular Weight: ${pubchemInfo.molecular_weight}) used for therapeutic treatment.`,
          effects: `This compound has the chemical structure: ${pubchemInfo.canonical_smiles || pubchemInfo.isomeric_smiles || 'Structure not available'}.`,
          precautions: 'Follow your doctor\'s instructions carefully and report any unusual side effects or concerns.'
        };
      }
    }
    // Fallback to backend API data
    else if (realTimeInfo && realTimeInfo.drugbank) {
      const drugbankInfo = realTimeInfo.drugbank;
      medicineInfo = {
        uses: `${drugName} is a medication used for ${drugbankInfo.indication || drugInfo.uses}.`,
        effects: drugbankInfo.mechanism_of_action || drugbankInfo.pharmacodynamics || 'This medication works by targeting specific pathways in your body to provide therapeutic benefits.',
        precautions: drugbankInfo.warnings ? drugbankInfo.warnings.join('. ') : 'Follow your doctor\'s instructions carefully and report any unusual side effects or concerns.'
      };
    }
    // Use static database as last resort
    else if (!medicineInfo) {
      console.log('⚠️ Using static database for:', drugName);
      const categoryInfo = getCategorySpecificInfo(drugInfo.category);
      medicineInfo = {
        uses: `${drugName} is a ${drugInfo.category} medication used for ${drugInfo.uses}.`,
        effects: categoryInfo.effects,
        precautions: categoryInfo.precautions
      };
    }

    // Add age-specific considerations
    let ageConsideration = '';
    if (patientAge > 65) {
      ageConsideration = ' Given your age, your doctor may start with a lower dose and monitor you more closely.';
    } else if (patientAge < 18) {
      ageConsideration = ' Pediatric dosing may be required with careful monitoring.';
    }

    // Add condition-specific considerations
    let conditionConsideration = '';
    if (patientConditions.includes('diabetes') && !drug.includes('metformin') && !drug.includes('insulin')) {
      conditionConsideration = ' Your diabetes condition requires careful monitoring of blood sugar levels while taking this medication.';
    } else if (patientConditions.includes('hypertension') && !drug.includes('lisinopril') && !drug.includes('metoprolol')) {
      conditionConsideration = ' Your blood pressure should be monitored regularly while taking this medication.';
    } else if (patientConditions.includes('heart') && !drug.includes('lisinopril') && !drug.includes('metoprolol')) {
      conditionConsideration = ' Your heart condition requires careful monitoring while taking this medication.';
    } else if (patientConditions.includes('kidney') || patientConditions.includes('renal')) {
      conditionConsideration = ' Your kidney function should be monitored regularly while taking this medication.';
    } else if (patientConditions.includes('liver') || patientConditions.includes('hepatic')) {
      conditionConsideration = ' Your liver function should be monitored regularly while taking this medication.';
    }

    return `${medicineInfo.uses} ${medicineInfo.effects} ${medicineInfo.precautions}${ageConsideration}${conditionConsideration}`;
    } finally {
      setLoadingDrugInfo(false);
    }
  };

  // Helper function to provide category-specific information for unknown drugs
  const getCategorySpecificInfo = (category: string) => {
    const categoryInfo: { [key: string]: { effects: string; precautions: string; } } = {
      'Analgesic/Antipyretic': {
        effects: 'It works by blocking pain signals and reducing fever by affecting the brain\'s temperature control center.',
        precautions: 'Do not exceed recommended dose. Monitor for liver damage with high doses or alcohol use.'
      },
      'NSAID': {
        effects: 'It reduces pain and inflammation by blocking enzymes that produce prostaglandins.',
        precautions: 'Take with food to prevent stomach irritation. Monitor for gastrointestinal bleeding and kidney function.'
      },
      'ACE Inhibitor': {
        effects: 'It relaxes blood vessels by blocking the conversion of angiotensin I to angiotensin II.',
        precautions: 'Monitor for dry cough, dizziness, and elevated potassium levels. Avoid during pregnancy.'
      },
      'Beta-blocker': {
        effects: 'It slows heart rate and reduces blood pressure by blocking beta-adrenergic receptors.',
        precautions: 'Do not stop suddenly. Monitor for fatigue and breathing problems in asthma patients.'
      },
      'Statin': {
        effects: 'It reduces cholesterol production in the liver by blocking HMG-CoA reductase enzyme.',
        precautions: 'Monitor liver function and muscle symptoms. Avoid grapefruit juice which can increase drug levels.'
      },
      'Antidiabetic': {
        effects: 'It helps control blood sugar levels through various mechanisms depending on the specific medication.',
        precautions: 'Monitor blood sugar regularly. Watch for signs of low blood sugar (hypoglycemia).'
      },
      'Proton Pump Inhibitor': {
        effects: 'It blocks the final step of acid production in the stomach, providing long-lasting acid suppression.',
        precautions: 'Take before meals. Long-term use may increase risk of bone fractures and vitamin B12 deficiency.'
      },
      'Antibiotic': {
        effects: 'It kills or stops the growth of bacteria by interfering with essential bacterial processes.',
        precautions: 'Complete the full course even if feeling better. Watch for allergic reactions and side effects.'
      },
      'SSRI Antidepressant': {
        effects: 'It increases serotonin levels in the brain by blocking serotonin reuptake.',
        precautions: 'May take 4-6 weeks to work. Monitor for mood changes and suicidal thoughts, especially in young adults.'
      },
      'Bronchodilator': {
        effects: 'It relaxes airway muscles, making breathing easier by opening up the airways.',
        precautions: 'Use as needed for symptoms. Overuse may cause tremors and increased heart rate.'
      },
      'Corticosteroid': {
        effects: 'It reduces inflammation and suppresses the immune system by mimicking natural cortisol.',
        precautions: 'Do not stop suddenly. Monitor for mood changes, weight gain, and increased infection risk.'
      }
    };

    return categoryInfo[category] || {
      effects: 'This medication works by targeting specific pathways in your body to provide therapeutic benefits.',
      precautions: 'Follow your doctor\'s instructions carefully and report any unusual side effects or concerns.'
    };
  };

  return (
    <div className="form-card">
      {!prediction ? (
        <>
          <div className="form-header">
            <h1 className="form-title">Patient Data Input</h1>
            <p className="form-subtitle">Enter patient details to predict drug response with our AI.</p>

            {error && (
              <div className="mt-3 text-sm text-red-800 bg-red-100 border border-red-200 rounded px-3 py-2">
                {error}
              </div>
            )}
            
            {/* API Status Indicator */}
            <div className="mt-3 flex items-center justify-center gap-2 text-sm">
              <span className={`w-3 h-3 rounded-full ${
                apiStatus === 'connected' ? 'bg-green-500' : 
                apiStatus === 'disconnected' ? 'bg-red-500' : 'bg-gray-400'
              }`}></span>
              <span className={
                apiStatus === 'connected' ? 'text-green-700' : 
                apiStatus === 'disconnected' ? 'text-red-700' : 'text-gray-600'
              }>
                {apiStatus === 'connected' ? 
                  `AI Model Connected ${systemStatus?.components?.ml_model ? '✓' : '⚠'}` : 
                  apiStatus === 'disconnected' ? 'API Disconnected - Service Unavailable' : 
                  'Checking Connection...'}
              </span>
              {systemStatus && apiStatus === 'connected' && (
                <span className="text-xs text-gray-500 ml-2">
                  v{systemStatus.version} | Response: {responseTime}ms | Real-time: {systemStatus.components?.real_data_integration ? '✓' : '✗'}
                </span>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{padding: '2rem'}}>
            {/* Medicine Name */}
            <div className="form-group">
              <label className="form-label">Medicine Name</label>
              <div className="input-container">
                <span className="input-icon material-symbols-outlined">link</span>
                <input
                  type="text"
                  name="medicineName"
                  value={formData.medicineName}
                  onChange={handleInputChange}
                  onBlur={async () => { await validateDrugName(formData.medicineName); }}
                  placeholder="e.g., Paracetamol"
                  className="form-input"
                  required
                />
                {drugValidation === 'checking' && (
                  <div className="text-xs text-gray-600 mt-1">Validating medicine name…</div>
                )}
                {drugValidation === 'valid' && (
                  <div className="text-xs text-green-700 mt-1">Medicine found ✓</div>
                )}
                {drugValidation === 'invalid' && (
                  <div className="text-xs text-red-700 mt-1">Not found in primary databases</div>
                )}
              </div>
            </div>

            {/* Gender and Age Row */}
            <div className="age-row">
              <div className="form-group" style={{flex: 1}}>
                <label className="form-label">Gender</label>
                <div className="input-container">
                  <span className="input-icon material-symbols-outlined">wc</span>
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleInputChange}
                    className="form-select"
                    required
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-group age-slider-container">
                <label className="form-label">Age</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={formData.age}
                    onChange={handleAgeChange}
                    className="age-slider flex-1"
                  />
                  <span className="text-lg font-semibold text-gray-700 min-w-[2rem]">{formData.age}</span>
                </div>
              </div>
            </div>

            {/* Weight, Height and BMI Row */}
            <div className="weight-bmi-row">
              <div className="form-group">
                <label className="form-label">Weight (kg)</label>
                <div className="input-container">
                  <span className="input-icon material-symbols-outlined">monitor_weight</span>
                  <input
                    type="number"
                    name="weight"
                    value={formData.weight}
                    onChange={handleInputChange}
                    placeholder="e.g., 70"
                    className="form-input"
                    step="0.1"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Height (cm)</label>
                <div className="input-container">
                  <span className="input-icon material-symbols-outlined">height</span>
                  <input
                    type="number"
                    name="height"
                    value={formData.height}
                    onChange={handleInputChange}
                    placeholder="e.g., 170"
                    className="form-input"
                    step="0.1"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">BMI</label>
                <div className="input-container">
                  <span className="input-icon material-symbols-outlined">straighten</span>
                  <input
                    type="text"
                    value={calculatedBMI}
                    placeholder="Auto-calculated"
                    className="form-input"
                    readOnly={true}
                    style={{backgroundColor: '#f1f3f4', cursor: 'not-allowed'}}
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Chronic Conditions</label>
              <textarea
                name="chronicConditions"
                value={formData.chronicConditions}
                onChange={handleInputChange}
                placeholder="List any chronic conditions, e.g., Hypertension, Diabetes"
                className="form-textarea"
                rows={4}
              />
              <div className="textarea-help">Please separate each condition with a comma.</div>
            </div>

            {/* Submit Button */}
              <button
              type="submit"
              disabled={loading || drugValidation === 'invalid'}
              className="submit-btn"
              style={{backgroundColor: '#1ABC9C'}}
            >
              <span className="material-symbols-outlined">psychology</span>
              {loading ? 'Getting Prediction...' : 'Get Prediction'}
            </button>
          </form>
        </>
      ) : null}

      {/* Prediction Result */}
      {renderPrediction()}
    </div>
  );

  // Render Comprehensive Prediction Results
  function renderPrediction() {
    if (!prediction) return null;
    
    return (
      <div className="prediction-container">
        {/* Header Section */}
          <div className="prediction-header">
            <h2 className="prediction-title">Drug Response Prediction</h2>
            <p className="prediction-subtitle">
              Patient: {formData.medicineName ? `Analysis for ${formData.medicineName}` : 'Current Patient'}
              {prediction.isRealAI && !prediction.isEnhanced && <span className="ml-2 text-green-600 text-sm font-semibold">● Live AI Analysis</span>}
              {prediction.isRealAI && prediction.isEnhanced && <span className="ml-2 text-blue-600 text-sm font-semibold">● Real-Time Analysis</span>}
            </p>
          </div>
          
        {/* Medicine Suitability Assessment */}
        {prediction.medicineSuitability && (
          <div className="prediction-summary-section">
            <h3 className="prediction-summary-title">Medicine Suitability Assessment</h3>
            <div className="suitability-assessment-card">
              <div className="suitability-header">
                <div className="suitability-status">
                  <span className={`suitability-badge suitability-${prediction.medicineSuitability.overall_suitability.color}`}>
                    {prediction.medicineSuitability.overall_suitability.status}
                  </span>
                  <div className="suitability-score">
                    <span className="score-number">{prediction.medicineSuitability.overall_suitability.score}%</span>
                    <span className="score-label">Suitability Score</span>
                  </div>
                </div>
                <div className="suitability-recommendation">
                  <p>{prediction.medicineSuitability.overall_suitability.recommendation}</p>
                </div>
              </div>
              
              {/* Assessment Factors */}
              {prediction.medicineSuitability.assessment_factors.length > 0 && (
                <div className="assessment-factors">
                  <h4>Key Assessment Factors:</h4>
                  <div className="factors-list">
                    {prediction.medicineSuitability.assessment_factors.map((factor, index) => (
                      <div key={index} className={`factor-item factor-${factor.impact}`}>
                        <div className="factor-header">
                          <span className="factor-name">{factor.factor}</span>
                          <span className={`impact-badge impact-${factor.impact}`}>
                            {factor.impact.toUpperCase()}
                          </span>
                        </div>
                        <p className="factor-description">{factor.description}</p>
                        <p className="factor-recommendation">{factor.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Safety Information */}
              <div className="safety-information">
                <h4>Safety Information:</h4>
                <div className="safety-grid">
                  <div className="safety-item">
                    <span className="safety-label">Drug Interactions:</span>
                    <span className={`safety-value ${prediction.medicineSuitability.safety_information.interactions.has_interactions ? 'warning' : 'safe'}`}>
                      {prediction.medicineSuitability.safety_information.interactions.has_interactions 
                        ? `${prediction.medicineSuitability.safety_information.interactions.interaction_count} interactions found`
                        : 'No major interactions'
                      }
                    </span>
                  </div>
                  <div className="safety-item">
                    <span className="safety-label">Monitoring Required:</span>
                    <span className={`safety-value ${prediction.medicineSuitability.safety_information.monitoring_required ? 'required' : 'optional'}`}>
                      {prediction.medicineSuitability.safety_information.monitoring_required ? 'Yes' : 'Standard'}
                    </span>
                  </div>
                </div>
                
                {prediction.medicineSuitability.safety_information.warnings.length > 0 && (
                  <div className="warnings-section">
                    <h5>Important Warnings:</h5>
                    <ul className="warnings-list">
                      {prediction.medicineSuitability.safety_information.warnings.map((warning, index) => (
                        <li key={index} className="warning-item">{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Prediction Summary */}
        <div className="prediction-summary-section">
          <h3 className="prediction-summary-title">Prediction Summary</h3>
          <div className="prediction-summary-card">
            <div className="prediction-icon">
              <span className="material-symbols-outlined" style={{fontSize: '14px'}}>check</span>
            </div>
            <div className="prediction-content">
              <h3>{prediction.prediction}</h3>
              <p>Based on the patient's genetic profile and medical history, the AI predicts a {prediction.prediction.toLowerCase()} response to the prescribed medication.</p>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="prediction-details-grid">
          {/* Safety and Efficacy Report */}
          <div className="prediction-card">
            <div className="prediction-card-header">
              <h3 className="prediction-card-title">Safety and Efficacy Report</h3>
            </div>
            <div className="prediction-card-content">
              <table className="prediction-table">
                <tbody>
                  <tr>
                    <td>Drug Name</td>
                    <td>{prediction.drugName}</td>
                  </tr>
                  <tr>
                    <td>Dosage</td>
                    <td>{prediction.dosage}</td>
                  </tr>
                  <tr>
                    <td>Predicted Class</td>
                    <td>
                      {prediction.isRealAI && prediction.prediction === 'Ineffective' ? 'Class 0' :
                       prediction.isRealAI && prediction.prediction === 'Effective' ? 'Class 1' :
                       prediction.isRealAI && prediction.prediction === 'Risky/Adverse' ? 'Class 2' :
                       prediction.prediction === 'Ineffective' ? 'Class 0' :
                       prediction.prediction === 'Effective' ? 'Class 1' :
                       prediction.prediction === 'Risky/Adverse' ? 'Class 2' :
                       'Class 1'}
                    </td>
                  </tr>
                  <tr>
                    <td>Predicted Outcome</td>
                    <td className="effective-text">{prediction.prediction}</td>
                  </tr>
                  <tr>
                    <td>Confidence Level</td>
                    <td>{(prediction.confidence * 100).toFixed(0)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Explanation */}
          <div className="prediction-card">
            <div className="prediction-card-header">
              <h3 className="prediction-card-title">Explanation</h3>
            </div>
            <div className="prediction-card-content">
              <div style={{fontSize: '0.875rem', lineHeight: '1.5', color: 'var(--text-dark)', margin: 0}}>
                {loadingDrugInfo ? (
                  <span className="flex items-center">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-2"></div>
                    Fetching real-time drug information...
                  </span>
                ) : (
                  prediction.explanation ? (
                    <div className="explanation-content" style={{ whiteSpace: 'pre-wrap' }}>
                      {prediction.explanation}
                    </div>
                  ) : (
                    <div 
                      className="explanation-content" 
                      dangerouslySetInnerHTML={{ 
                        __html: formatExplanationText('Loading detailed explanation...', prediction.drugName || formData.medicineName) 
                      }} 
                    />
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Pharmacogenetic Profile */}
        <div className="data-points-section">
          <h3 className="data-points-title">Pharmacogenetic Profile</h3>
          
          <table className="pharmacogenetic-table">
            <thead>
              <tr>
                <th>DATA POINT</th>
                <th>VALUE</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Genetic Marker A</td>
                <td className="pharmacogenetic-value">
                  {prediction.isEnhanced && Array.isArray(prediction.geneticMarkers) && prediction.geneticMarkers.length > 0 ? 
                    (prediction.geneticMarkers[0].phenotype.includes('Poor') || prediction.geneticMarkers[0].phenotype.includes('Rapid') ? 'Positive' : 'Negative') :
                    (!Array.isArray(prediction.geneticMarkers) ? prediction.geneticMarkers?.markerA : 'Positive')}
                </td>
              </tr>
              <tr>
                <td>Genetic Marker B</td>
                <td className="pharmacogenetic-value">
                  {prediction.isEnhanced && Array.isArray(prediction.geneticMarkers) && prediction.geneticMarkers.length > 1 ? 
                    (prediction.geneticMarkers[1].phenotype.includes('Poor') || prediction.geneticMarkers[1].phenotype.includes('Rapid') ? 'Positive' : 'Negative') :
                    (!Array.isArray(prediction.geneticMarkers) ? prediction.geneticMarkers?.markerB : 'Negative')}
                </td>
              </tr>
              <tr>
                <td>Medical History</td>
                <td className="pharmacogenetic-value">
                  {formData.chronicConditions || 'No contraindications'}
                </td>
              </tr>
              <tr>
                <td>BMI</td>
                <td className="pharmacogenetic-value">
                  {calculatedBMI || 'N/A'}
                </td>
              </tr>
              <tr>
                <td>Age</td>
                <td className="pharmacogenetic-value">
                  {formData.age} years
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Genetic Markers Explanation */}
        <div className="data-points-section">
          <h3 className="data-points-title">Pharmacogenetic Insights</h3>
          
          <div className="prediction-card">
            <div className="prediction-card-content">
              <div className="space-y-3">
                <div>
                  <h4 className="font-semibold text-sm text-gray-800 mb-1">
                    {prediction.isEnhanced && Array.isArray(prediction.geneticMarkers) && prediction.geneticMarkers.length > 0 ? 
                      `${prediction.geneticMarkers[0].gene} (Genetic Marker A): ${prediction.geneticMarkers[0].phenotype}` :
                      `CYP2D6 (Genetic Marker A): ${!Array.isArray(prediction.geneticMarkers) ? prediction.geneticMarkers?.markerA : 'Positive'}`}
                  </h4>
                  <p className="text-xs text-gray-600">
                    {prediction.isEnhanced && Array.isArray(prediction.geneticMarkers) && prediction.geneticMarkers.length > 0 ? 
                      `${prediction.geneticMarkers[0].clinicalSignificance || 'Clinical significance assessment based on phenotype analysis.'}` :
                      ((!Array.isArray(prediction.geneticMarkers) && prediction.geneticMarkers?.markerA === 'Positive') 
                        ? 'Poor metabolizer phenotype. Patient may experience prolonged drug effects and higher risk of adverse reactions. Consider dose reduction or alternative medications.'
                        : 'Normal metabolizer phenotype. Standard dosing protocols are appropriate. Patient should respond typically to most medications processed by this enzyme.'
                      )}
                  </p>
                  {prediction.isEnhanced && Array.isArray(prediction.geneticMarkers) && prediction.geneticMarkers.length > 0 && prediction.geneticMarkers[0].drugsAffected && (
                    <p className="text-xs text-blue-600 mt-1">
                      <strong>Affected drugs:</strong> {prediction.geneticMarkers[0].drugsAffected.slice(0, 3).join(', ')}
                      {prediction.geneticMarkers[0].drugsAffected.length > 3 && ` and ${prediction.geneticMarkers[0].drugsAffected.length - 3} more`}
                    </p>
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-800 mb-1">
                    {prediction.isEnhanced && Array.isArray(prediction.geneticMarkers) && prediction.geneticMarkers.length > 1 ? 
                      `${prediction.geneticMarkers[1].gene} (Genetic Marker B): ${prediction.geneticMarkers[1].phenotype}` :
                      `CYP3A4 (Genetic Marker B): ${!Array.isArray(prediction.geneticMarkers) ? prediction.geneticMarkers?.markerB : 'Negative'}`}
                  </h4>
                  <p className="text-xs text-gray-600">
                    {prediction.isEnhanced && Array.isArray(prediction.geneticMarkers) && prediction.geneticMarkers.length > 1 ? 
                      `${prediction.geneticMarkers[1].clinicalSignificance || 'Clinical significance assessment based on phenotype analysis.'}` :
                      ((!Array.isArray(prediction.geneticMarkers) && prediction.geneticMarkers?.markerB === 'Positive')
                        ? 'Ultra-rapid metabolizer phenotype. Patient may require higher doses for therapeutic effect. Monitor for reduced drug efficacy and consider dose adjustments.'
                        : 'Normal metabolizer phenotype. Standard drug interactions and metabolism expected. Typical response to medications processed by this major enzyme pathway.'
                      )}
                  </p>
                  {prediction.isEnhanced && Array.isArray(prediction.geneticMarkers) && prediction.geneticMarkers.length > 1 && prediction.geneticMarkers[1].drugsAffected && (
                    <p className="text-xs text-blue-600 mt-1">
                      <strong>Affected drugs:</strong> {prediction.geneticMarkers[1].drugsAffected.slice(0, 3).join(', ')}
                      {prediction.geneticMarkers[1].drugsAffected.length > 3 && ` and ${prediction.geneticMarkers[1].drugsAffected.length - 3} more`}
                    </p>
                  )}
                </div>
                <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-xs text-blue-800">
                    <strong>Clinical Note:</strong> These genetic markers affect approximately 75% of all prescription medications. 
                    {prediction.isRealAI ? 
                      (prediction.isEnhanced ? 
                        ' Results based on AI analysis with real-time genetic profiling and patient data integration.' : 
                        ' Results based on real-time AI analysis of patient profile.') : 
                      ' Results simulated for demonstration purposes.'
                    }
                    {prediction.responseTime && ` Analysis completed in ${prediction.responseTime}ms.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Personalized Recommendations */}
        {prediction.medicineSuitability && (
          <div className="recommendations-section">
            <h3 className="recommendations-title">Personalized Recommendations</h3>
            <div className="recommendations-grid">
              <div className="recommendations-card">
                <h4>What to Do Next:</h4>
                <ul className="recommendations-list">
                  {prediction.medicineSuitability.personalized_recommendations.map((rec, index) => (
                    <li key={index} className="recommendation-item">{rec}</li>
                  ))}
                </ul>
              </div>
              
              <div className="recommendations-card">
                <h4>Next Steps:</h4>
                <ul className="next-steps-list">
                  {prediction.medicineSuitability.next_steps.map((step, index) => (
                    <li key={index} className="next-step-item">
                      <span className="step-number">{index + 1}</span>
                      <span className="step-text">{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            
            <div className="emergency-notice">
              <div className="emergency-icon">
                <span className="material-symbols-outlined">warning</span>
              </div>
              <div className="emergency-text">
                <strong>Important:</strong> {prediction.medicineSuitability.emergency_contact}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="action-buttons">
          <button 
            className="action-btn action-btn-secondary"
            onClick={() => setPrediction(null)}
          >
            Make Changes
          </button>
          <button 
            className="action-btn action-btn-primary"
            onClick={() => {
              setPrediction(null);
              setFormData({
                medicineName: '',
                gender: '',
                age: 45,
                weight: '',
                height: '',
                chronicConditions: ''
              });
            }}
          >
            New Prediction
          </button>
        </div>
      </div>
    );
  }
}