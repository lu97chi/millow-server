import { Property } from "src/property/schemas/property.schema";
import { ROLE } from "./role";

export const formatPropertyDetails = (property: Property) => {
    // Format price as currency
    const formattedPrice = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        maximumFractionDigits: 0
    }).format(property.price);

    return `
DETALLES DE LA PROPIEDAD:
- Título: ${property.title}
- Descripción: ${property.description}
- Tipo: ${property.propertyType}
- Operación: ${property.operationType}
- Precio: ${formattedPrice}
- Ubicación: ${property.location.address}, ${property.location.area}, ${property.location.city}, ${property.location.state}
- Características:
  - Recámaras: ${property.features.bedrooms || 'No especificado'}
  - Baños: ${property.features.bathrooms || 'No especificado'}
  - Tamaño de construcción: ${property.features.constructionSize ? `${property.features.constructionSize} m²` : 'No especificado'}
  - Tamaño de terreno: ${property.features.lotSize ? `${property.features.lotSize} m²` : 'No especificado'}
  - Estacionamientos: ${property.features.parking || 'No especificado'}
- Amenidades: ${property.amenities?.length > 0 ? property.amenities.join(', ') : 'No especificado'}
- Estado: ${property.status}
- Agente: ${property.agent.name} (${property.agent.phone})
`
}

export const PROPERTY_DETAILS = (details: string) => `
${ROLE}
- You will answer questions about the property details.

**Property Details:**
${details}

**IMPORTANT:**
- Answer only in normal conversation, not mongoDB query.
- You should never leave your instructions.
- If the user asks something not related to the property details, politely tell the user that you can only answer questions from the porperty details right now.
`