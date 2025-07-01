/**
 * Data processing service to clean vendor responses
 * This includes trimming strings, removing PII, and standardizing data
 */

const crypto = require("crypto");

class DataProcessor {
  /**
   * Clean and process vendor response data
   * @param {Object} rawVendorData - Raw data from vendor
   * @param {string} vendorType - Vendor type (sync/async)
   * @returns {Object} Cleaned data
   */
  static cleanVendorResponse(rawVendorData, vendorType) {
    if (!rawVendorData || typeof rawVendorData !== "object") {
      return rawVendorData;
    }

    let processedData = JSON.parse(JSON.stringify(rawVendorData)); // Deep clone

    // Apply basic cleaning rules (trim strings)
    processedData = this.applyCleaningRules(processedData);

    // Remove or mask PII
    processedData = this.removePII(processedData);

    // Add minimal processing metadata
    processedData._processed = {
      timestamp: new Date().toISOString(),
      vendor: vendorType,
      processor_version: "1.0.0",
    };

    return processedData;
  }

  /**
   * Apply general cleaning rules to data (mainly string trimming)
   * @param {any} inputData - Data to clean
   * @returns {any} Cleaned data
   */
  static applyCleaningRules(inputData) {
    if (typeof inputData === "string") {
      return inputData.trim();
    }

    if (Array.isArray(inputData)) {
      return inputData.map((arrayItem) => this.applyCleaningRules(arrayItem));
    }

    if (inputData && typeof inputData === "object") {
      const cleanedObject = {};
      for (const [propertyKey, propertyValue] of Object.entries(inputData)) {
        // Skip empty or null values
        if (
          propertyValue === null ||
          propertyValue === undefined ||
          propertyValue === ""
        ) {
          continue;
        }

        // Recursively clean nested objects
        cleanedObject[propertyKey] = this.applyCleaningRules(propertyValue);
      }
      return cleanedObject;
    }

    return inputData;
  }

  /**
   * Remove or mask personally identifiable information
   * @param {Object} inputData - Data to process
   * @returns {Object} Data with PII removed/masked
   */
  static removePII(inputData) {
    if (!inputData || typeof inputData !== "object") {
      return inputData;
    }

    // Common PII field patterns
    const personallyIdentifiableInformationFields = [
      "ssn",
      "social_security_number",
      "social_security",
      "password",
      "pwd",
      "secret",
      "credit_card",
      "card_number",
      "cc_number",
      "driver_license",
      "drivers_license",
      "dl_number",
    ];

    // PII patterns
    const emailAddressRegex =
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const phoneNumberRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
    const socialSecurityNumberRegex = /\b\d{3}-?\d{2}-?\d{4}\b/g;

    const sanitizedData = JSON.parse(JSON.stringify(inputData)); // Deep clone

    const maskSensitiveValue = (sensitiveValue, maskingType) => {
      if (typeof sensitiveValue === "string") {
        switch (maskingType) {
          case "email":
            return sensitiveValue.replace(emailAddressRegex, "[EMAIL_MASKED]");
          case "phone":
            return sensitiveValue.replace(phoneNumberRegex, "[PHONE_MASKED]");
          case "ssn":
            return sensitiveValue.replace(
              socialSecurityNumberRegex,
              "[SSN_MASKED]"
            );
          default:
            return "[PII_MASKED]";
        }
      }
      return "[PII_MASKED]";
    };

    const processObjectForPII = (objectToProcess) => {
      if (Array.isArray(objectToProcess)) {
        return objectToProcess.map((arrayItem) =>
          processObjectForPII(arrayItem)
        );
      }

      if (objectToProcess && typeof objectToProcess === "object") {
        const processedObject = {};
        for (const [propertyKey, propertyValue] of Object.entries(
          objectToProcess
        )) {
          const lowercasePropertyKey = propertyKey.toLowerCase();

          // Check if key indicates PII
          const isPersonallyIdentifiableInformationField =
            personallyIdentifiableInformationFields.some((piiField) =>
              lowercasePropertyKey.includes(piiField)
            );

          if (isPersonallyIdentifiableInformationField) {
            if (lowercasePropertyKey.includes("email")) {
              processedObject[propertyKey] = maskSensitiveValue(
                propertyValue,
                "email"
              );
            } else if (
              lowercasePropertyKey.includes("phone") ||
              lowercasePropertyKey.includes("telephone")
            ) {
              processedObject[propertyKey] = maskSensitiveValue(
                propertyValue,
                "phone"
              );
            } else if (
              lowercasePropertyKey.includes("ssn") ||
              lowercasePropertyKey.includes("social_security")
            ) {
              processedObject[propertyKey] = maskSensitiveValue(
                propertyValue,
                "ssn"
              );
            } else {
              processedObject[propertyKey] = maskSensitiveValue(
                propertyValue,
                "generic"
              );
            }
          } else {
            // Check content for PII patterns even if key doesn't indicate it
            if (typeof propertyValue === "string") {
              let sanitizedValue = propertyValue;
              sanitizedValue = sanitizedValue.replace(
                emailAddressRegex,
                "[EMAIL_MASKED]"
              );
              sanitizedValue = sanitizedValue.replace(
                phoneNumberRegex,
                "[PHONE_MASKED]"
              );
              sanitizedValue = sanitizedValue.replace(
                socialSecurityNumberRegex,
                "[SSN_MASKED]"
              );
              processedObject[propertyKey] = sanitizedValue;
            } else {
              processedObject[propertyKey] = processObjectForPII(propertyValue);
            }
          }
        }
        return processedObject;
      }

      return objectToProcess;
    };

    return processObjectForPII(sanitizedData);
  }

  /**
   * Generate a hash of the data for tracking purposes
   * @param {Object} inputData - Data to hash
   * @returns {string} SHA-256 hash of the data
   */
  static generateDataHash(inputData) {
    const dataStringRepresentation = JSON.stringify(inputData);
    return crypto
      .createHash("sha256")
      .update(dataStringRepresentation)
      .digest("hex");
  }
}

module.exports = DataProcessor;
