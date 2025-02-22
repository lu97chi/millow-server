export type PropertyTypeName =
  | "Desarrollos verticales"
  | "Casas"
  | "Locales Comerciales"
  | "Oficinas"
  | "Edificios"
  | "Casas uso de suelo"
  | "Bodegas comerciales"
  | "Locales en centro comercial"
  | "Departamentos"
  | "Casas en condominio"
  | 'Desarrollos horizontales'
  | 'Naves industriales'
  | 'Terrenos comerciales'
  | 'Terrenos';

export type OperationType = "Venta" | "Renta" | "Desarrollo";
export type PropertyEntityType = "development" | "property";
export type PropertyStatus = "available" | "sold" | "rented";
export type Amenity =
  | "Alberca"
  | "Circuito Cerrado"
  | "Estacionamientos"
  | "Gimnasio"
  | "Jardín"
  | "Roof Garden";

export interface PropertyFilters {
  id?: string;
  title?: string;
  description?: string;
  propertyType?: PropertyTypeName[];
  operationType?: OperationType[];
  type?: PropertyEntityType[];
  minPrice?: number;
  maxPrice?: number;
  location?: {
    state?: string[];
    city?: string[];
    area?: string[];
    address?: string;
    coordinates?: {
      lat?: number;
      lng?: number;
    };
  };
  features?: {
    bedrooms?: number;
    bathrooms?: number;
    constructionSize?: {
      min?: number;
      max?: number;
    };
    lotSize?: {
      min?: number;
      max?: number;
    };
    parking?: number;
    floors?: number;
  };
  amenities?: Amenity[];
  status?: PropertyStatus[];
  maintenanceFee?: {
    min?: number;
    max?: number;
  };
  sortBy?: 'price asc' | 'price desc' | 'age asc' | 'age desc';
  page?: number;
  pageSize?: number;
} 