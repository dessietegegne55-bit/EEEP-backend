// backend/src/utils/smartColumnDetector.js

/**
 * Local pattern matching for column detection (no API needed)
 */
function localColumnDetection(headers) {
  const mapping = {};

  // Define patterns for each field
  const patterns = {
    firstName: [/^first/i, /^fname$/i, /given/i, /student first/i, /^fn$/i, /^f\.name/i],
    lastName: [/^last/i, /^lname$/i, /surname/i, /family/i, /student last/i, /^ln$/i, /^l\.name/i],
    middleName: [/middle/i, /mname/i, /second/i, /other/i, /^mn$/i],
    idNumber: [/id$/i, /^id$/i, /number/i, /roll/i, /student id/i, /registration/i, /^id no$/i, /^student id$/i],
    grade: [/grade/i, /class/i, /level/i, /year/i, /form/i, /^gr$/i],
    department: [/dept/i, /department/i, /stream/i, /major/i, /section/i, /field/i],
    sex: [/sex/i, /gender/i, /male/i, /female/i, /^m$/i, /^f$/i],
  };

  for (const [field, regexes] of Object.entries(patterns)) {
    let bestMatch = null;
    let bestScore = 0;

    for (const header of headers) {
      const lowerHeader = String(header).toLowerCase().trim();
      const cleanHeader = lowerHeader.replace(/[^a-z]/g, '');
      let score = 0;

      // Exact match
      if (cleanHeader === field.toLowerCase()) score += 50;
      if (lowerHeader === field) score += 50;

      // Pattern matching
      for (const regex of regexes) {
        if (regex.test(lowerHeader)) score += 30;
        if (regex.test(cleanHeader)) score += 20;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = header;
      }
    }

    if (bestMatch && bestScore >= 20) {
      mapping[field] = bestMatch;
    }
  }

  return mapping;
}

/**
 * Smart column detection with confidence scoring
 */
function detectColumnsWithConfidence(headers, sampleRow) {
  const patterns = {
    firstName: [/^first/i, /^fname$/i, /given/i, /student first/i, /^fn$/i, /^f\.name/i],
    lastName: [/^last/i, /^lname$/i, /surname/i, /family/i, /student last/i, /^ln$/i, /^l\.name/i],
    middleName: [/middle/i, /mname/i, /second/i, /other/i, /^mn$/i],
    idNumber: [/id$/i, /^id$/i, /number/i, /roll/i, /student id/i, /registration/i, /^id no$/i, /^student id$/i],
    grade: [/grade/i, /class/i, /level/i, /year/i, /form/i, /^gr$/i],
    department: [/dept/i, /department/i, /stream/i, /major/i, /section/i, /field/i],
    sex: [/sex/i, /gender/i, /male/i, /female/i, /^m$/i, /^f$/i],
  };

  const mapping = {};

  for (const [field, regexes] of Object.entries(patterns)) {
    let bestMatch = null;
    let bestScore = 0;

    for (const header of headers) {
      let score = 0;
      const lowerHeader = header.toLowerCase().trim();
      const cleanHeader = lowerHeader.replace(/[^a-z]/g, '');

      // Exact match bonus
      if (cleanHeader === field.toLowerCase()) score += 50;
      if (lowerHeader === field) score += 50;

      // Pattern matching
      for (const regex of regexes) {
        if (regex.test(lowerHeader)) score += 30;
        if (regex.test(cleanHeader)) score += 20;
      }

      // Sample data validation
      if (sampleRow && sampleRow[header]) {
        const sampleValue = String(sampleRow[header]).toLowerCase();
        if (field === 'firstName' && sampleValue.length >= 2 && sampleValue.length <= 30) score += 10;
        if (field === 'idNumber' && /[0-9]{3,}/.test(sampleValue)) score += 25;
        if (field === 'grade') {
          if (/^[9-9]$|^1[0-2]$/.test(sampleValue)) score += 25;
          if (sampleValue === '12' || sampleValue === 'grade 12' || sampleValue === '12th') score += 20;
        }
        if (field === 'sex' && (sampleValue === 'm' || sampleValue === 'f' || sampleValue === 'male' || sampleValue === 'female')) score += 25;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = header;
      }
    }

    mapping[field] = {
      column: bestMatch,
      confidence: bestScore,
      needsReview: bestScore < 60,
    };
  }

  return mapping;
}

/**
 * Smart column detection (main function)
 */
async function smartDetectColumns(headers, sampleRow = null) {
  console.log('🔍 Detecting columns from headers:', headers);

  // Use local detection with confidence
  const mapping = detectColumnsWithConfidence(headers, sampleRow);

  // Add required fields check
  const requiredFields = ['firstName', 'lastName', 'idNumber'];
  const missingRequired = requiredFields.filter(field => !mapping[field]?.column);

  console.log('📊 Detected mapping:', mapping);
  console.log('⚠️ Missing required fields:', missingRequired);

  return {
    mapping,
    missingRequired,
    hasMissingRequired: missingRequired.length > 0,
  };
}

/**
 * Get friendly column suggestions
 */
function getColumnSuggestions(headers) {
  const suggestions = {};

  for (const header of headers) {
    const lower = header.toLowerCase().trim();

    if (lower.includes('first') || lower.includes('fname')) {
      suggestions.firstName = header;
    }
    else if (lower.includes('last') || lower.includes('lname') || lower.includes('surname')) {
      suggestions.lastName = header;
    }
    else if (lower.includes('id') || lower.includes('number')) {
      suggestions.idNumber = header;
    }
    else if (lower.includes('dept') || lower.includes('department')) {
      suggestions.department = header;
    }
    else if (lower.includes('grade') || lower.includes('level')) {
      suggestions.grade = header;
    }
    else if (lower.includes('sex') || lower.includes('gender')) {
      suggestions.sex = header;
    }
    else if (lower.includes('middle')) {
      suggestions.middleName = header;
    }
  }

  return suggestions;
}

module.exports = {
  smartDetectColumns,
  localColumnDetection,
  detectColumnsWithConfidence,
  getColumnSuggestions,
};