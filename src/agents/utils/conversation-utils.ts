/**
 * Conversation Utilities
 *
 * Changes:
 * - Created utility functions for enhancing conversation context
 * - Added function to append previous agent results to conversation history
 * - Added function to extract previous agent results from conversation history
 * - Enhanced to provide better context about search results, especially when no properties are found
 * - Fixed linter errors with proper null checks
 * - Improved empty results detection with more comprehensive checks
 * - Enhanced warning message for responses that don't acknowledge empty results
 * - Added better context about search criteria for empty results
 */
import { ChatMessage } from '../interfaces/agent.interface';
import { AgentOutput } from '../interfaces/agent.interface';

/**
 * Appends the previous agent result to the conversation history as a system message
 * This provides better context for the next agent in the flow
 *
 * @param conversationHistory The original conversation history
 * @param previousResult The result from the previous agent
 * @returns Enhanced conversation history with the previous result appended
 */
export function appendPreviousResultToConversationHistory(
  conversationHistory: ChatMessage[],
  previousResult: AgentOutput,
): ChatMessage[] {
  // Create a copy of the conversation history to avoid modifying the original
  const enhancedHistory = [...conversationHistory];

  // Ensure data exists
  const data = previousResult.data || {};

  // Comprehensive check for empty search results
  const emptyResultsInfo = detectEmptyResults(data);
  const emptySearchResults = emptyResultsInfo.isEmpty;

  // Check if there's a mongoQuery to understand what was searched for
  const hasMongoQuery = data.mongoQuery !== undefined;

  // Create a system message with the previous result information
  let contentMessage = `Previous agent result information:
Response: "${previousResult.response}"
`;

  // Add specific information about search results
  if (emptyResultsInfo.hasSearchResults) {
    contentMessage += `Search Results: ${
      emptySearchResults
        ? 'NO PROPERTIES FOUND'
        : `${emptyResultsInfo.resultsCount} properties found`
    }\n`;

    // Add metadata if available
    if (data.searchResults?.metadata) {
      contentMessage += `Search Metadata: ${JSON.stringify(data.searchResults.metadata, null, 2)}\n`;
    }
  }

  // Add mongoQuery information if available
  if (hasMongoQuery) {
    contentMessage += `Search Query: ${JSON.stringify(data.mongoQuery, null, 2)}\n`;
  }

  // Add information about properties if available
  if ('properties' in data) {
    const propertiesCount = Array.isArray(data.properties)
      ? data.properties.length
      : 'not an array';
    contentMessage += `Properties: ${
      Array.isArray(data.properties) && data.properties.length === 0
        ? 'NO PROPERTIES FOUND'
        : `${propertiesCount} properties`
    }\n`;
  }

  // Add information about filtered or validated properties if available
  if ('filteredProperties' in data) {
    const filteredCount = Array.isArray(data.filteredProperties)
      ? data.filteredProperties.length
      : 'not an array';
    contentMessage += `Filtered Properties: ${filteredCount}\n`;
  }

  if ('validatedCount' in data) {
    contentMessage += `Validated Properties Count: ${data.validatedCount}\n`;
  }

  if ('totalCount' in data) {
    contentMessage += `Total Properties Count: ${data.totalCount}\n`;
  }

  // Add a warning if the response doesn't match the search results
  if (
    emptySearchResults &&
    !isAppropriateEmptyResultsResponse(previousResult.response)
  ) {
    contentMessage += `
WARNING: The response indicates success but NO PROPERTIES were found in the search results. 
The response should acknowledge that no properties were found and suggest alternatives.
Search criteria: ${extractSearchCriteria(data)}
`;
  }

  // Add the rest of the data
  contentMessage += `
Data: ${JSON.stringify(data, null, 2)}

This information is provided for context to help you generate a more accurate and contextually appropriate response.`;

  const previousResultContext: ChatMessage = {
    role: 'system',
    content: contentMessage,
  };

  // Add the system message to the conversation history
  enhancedHistory.push(previousResultContext);

  return enhancedHistory;
}

/**
 * Extract previous agent result from conversation history if available
 * @param history The conversation history
 * @returns The previous agent result as a string, or null if not found
 */
export function extractPreviousAgentResult(
  history: ChatMessage[],
): string | null {
  if (!history || history.length === 0) {
    return null;
  }

  // Look for system messages that contain previous agent result information
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (
      message.role === 'system' &&
      message.content.includes('Previous agent result information:')
    ) {
      return message.content;
    }
  }

  return null;
}

/**
 * Comprehensive detection of empty results in different data structures
 * @param data The data object to check
 * @returns Object with isEmpty flag, hasSearchResults flag, resultsCount, and details
 */
function detectEmptyResults(data: any): {
  isEmpty: boolean;
  hasSearchResults: boolean;
  resultsCount: number;
  details: string;
} {
  // Initialize result
  let isEmpty = false;
  let hasSearchResults = false;
  let resultsCount = 0;
  const details: string[] = [];

  // Check searchResults.data
  if (data.searchResults?.data !== undefined) {
    hasSearchResults = true;
    resultsCount = Array.isArray(data.searchResults.data)
      ? data.searchResults.data.length
      : 0;

    if (
      Array.isArray(data.searchResults.data) &&
      data.searchResults.data.length === 0
    ) {
      isEmpty = true;
      details.push('searchResults.data is an empty array');
    }
  }

  // Check properties
  if ('properties' in data) {
    if (!hasSearchResults) {
      resultsCount = Array.isArray(data.properties)
        ? data.properties.length
        : 0;
    }

    if (Array.isArray(data.properties) && data.properties.length === 0) {
      isEmpty = true;
      details.push('properties is an empty array');
    }
  }

  // Check filteredProperties
  if ('filteredProperties' in data) {
    if (!hasSearchResults && !('properties' in data)) {
      resultsCount = Array.isArray(data.filteredProperties)
        ? data.filteredProperties.length
        : 0;
    }

    if (
      Array.isArray(data.filteredProperties) &&
      data.filteredProperties.length === 0
    ) {
      isEmpty = true;
      details.push('filteredProperties is an empty array');
    }
  }

  // Check validatedProperties
  if ('validatedProperties' in data) {
    if (
      !hasSearchResults &&
      !('properties' in data) &&
      !('filteredProperties' in data)
    ) {
      resultsCount = Array.isArray(data.validatedProperties)
        ? data.validatedProperties.length
        : 0;
    }

    if (
      Array.isArray(data.validatedProperties) &&
      data.validatedProperties.length === 0
    ) {
      isEmpty = true;
      details.push('validatedProperties is an empty array');
    }
  }

  // Check if there's a validatedCount of 0
  if ('validatedCount' in data && data.validatedCount === 0) {
    isEmpty = true;
    details.push('validatedCount is 0');
  }

  // Check if there's a totalCount of 0
  if ('totalCount' in data && data.totalCount === 0) {
    isEmpty = true;
    details.push('totalCount is 0');
  }

  // Check if there's metadata indicating no results
  if (data.searchResults?.metadata?.matchingResults === 0) {
    isEmpty = true;
    details.push('searchResults.metadata.matchingResults is 0');
  }

  return {
    isEmpty,
    hasSearchResults,
    resultsCount,
    details: details.join(', '),
  };
}

/**
 * Check if a response is appropriate for empty search results
 * @param response The response to check
 * @returns True if the response is appropriate for empty results
 */
function isAppropriateEmptyResultsResponse(response: string): boolean {
  // Convert to lowercase for case-insensitive matching
  const lowerResponse = response.toLowerCase();

  // Check for common phrases that indicate acknowledging no results
  const acknowledgmentPhrases = [
    'no encontré',
    'no pude encontrar',
    'no he encontrado',
    'no hay',
    'no existen',
    'no se encontraron',
    'no se encontró',
    'no encontramos',
    'no tenemos',
    'lo siento',
    'disculpa',
    'lamento',
  ];

  // Check for phrases suggesting alternatives
  const alternativePhrases = [
    'intenta',
    'podrías',
    'puedes',
    'considera',
    'quizás',
    'tal vez',
    'otra',
    'diferente',
    'alternativa',
    'modificar',
    'cambiar',
    'ajustar',
  ];

  // Check if the response acknowledges no results
  const acknowledgesNoResults = acknowledgmentPhrases.some((phrase) =>
    lowerResponse.includes(phrase),
  );

  // Check if the response suggests alternatives
  const suggestsAlternatives = alternativePhrases.some((phrase) =>
    lowerResponse.includes(phrase),
  );

  // A good empty results response should both acknowledge no results and suggest alternatives
  return acknowledgesNoResults && suggestsAlternatives;
}

/**
 * Extract search criteria from data for better context in empty results responses
 * @param data The data object
 * @returns A string representation of the search criteria
 */
function extractSearchCriteria(data: any): string {
  let criteria = '';

  // Check for mongoQuery
  if (data.mongoQuery) {
    criteria = JSON.stringify(data.mongoQuery, null, 2);
  }

  // Check for extractedInputs
  if (data.extractedInputs) {
    if (criteria) criteria += '\n\n';
    criteria += `Extracted Inputs: ${JSON.stringify(data.extractedInputs, null, 2)}`;
  }

  // Check for location
  if (data.location) {
    if (criteria) criteria += '\n\n';
    criteria += `Location: ${typeof data.location === 'string' ? data.location : JSON.stringify(data.location)}`;
  }

  // Check for amenities
  if (data.amenities) {
    if (criteria) criteria += '\n\n';
    criteria += `Amenities: ${Array.isArray(data.amenities) ? data.amenities.join(', ') : data.amenities}`;
  }

  // If we still don't have criteria, use a generic message
  if (!criteria) {
    criteria = 'No specific search criteria found in data';
  }

  return criteria;
}
