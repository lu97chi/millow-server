/**
 * Maps Interfaces
 *
 * Changes:
 * - Created separate file for Maps interfaces
 * - Made lat and lng optional in Coordinates interface
 */

// Interface for location coordinates
export interface Coordinates {
  lat?: number;
  lng?: number;
}

// Interface for place search results
export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  location: Coordinates;
  types: string[];
  rating?: number;
  userRatingsTotal?: number;
  vicinity?: string;
  distance?: number; // Distance in meters from the reference point
}

// Interface for Maps API response
export interface MapsResponse {
  results: PlaceResult[];
  status: string;
  message?: string;
}
