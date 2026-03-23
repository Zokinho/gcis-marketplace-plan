/**
 * Category-based field visibility config for CreateListing form.
 *
 * Maps each product category to a group (flower / concentrates / edibles / other)
 * and defines which form fields are required, optional, or hidden per group.
 */

export type CategoryGroup = 'flower' | 'concentrates' | 'edibles' | 'other';
export type FieldVisibility = 'required' | 'optional' | 'hidden';

/** Every conditional field in the CreateListing form. */
export type ConditionalField =
  | 'type'
  | 'lineage'
  | 'harvestDate'
  | 'growthMedium'
  | 'certifications'
  | 'thc'
  | 'cbd'
  | 'terpenes'
  | 'budSizes'
  | 'upcomingQty'
  | 'minQtyRequest'
  | 'images'
  | 'coaFiles';

export type FieldConfig = Record<ConditionalField, FieldVisibility>;

const CATEGORY_GROUP_MAP: Record<string, CategoryGroup> = {
  // Flower
  'Cannabis flowers (mix sizes)': 'flower',
  'Cannabis flowers (smalls only)': 'flower',
  'Cannabis flowers (fresh frozen)': 'flower',
  'Cannabis flowers (outdoor grown)': 'flower',
  'Cannabis flowers (outdoor fresh frozen)': 'flower',
  'Milled Flower': 'flower',
  'Cannabis trimmings': 'flower',
  // Concentrates
  'Cannabis kief': 'concentrates',
  'Cannabis cured rosins and cured resins': 'concentrates',
  'Cannabis hashish': 'concentrates',
  'Cannabis live rosin and live resin': 'concentrates',
  'Cannabinoid isolates': 'concentrates',
  'Cannabinoid distillates': 'concentrates',
  "Cannabis crude oils ('resins')": 'concentrates',
  'THCa diamonds': 'concentrates',
  // Flower (THCa)
  'THCa flowers': 'flower',
  // Edibles
  'Chocolates': 'edibles',
  'Gummies': 'edibles',
  'Edibles (others)': 'edibles',
  // Other
  'Genetics': 'other',
};

const GROUP_FIELDS: Record<CategoryGroup, FieldConfig> = {
  flower: {
    type: 'optional',
    lineage: 'required',
    harvestDate: 'required',
    growthMedium: 'optional',
    certifications: 'required',
    thc: 'required',
    cbd: 'optional',
    terpenes: 'required',
    budSizes: 'optional',
    upcomingQty: 'optional',
    minQtyRequest: 'required',
    images: 'required',
    coaFiles: 'required',
  },
  concentrates: {
    type: 'optional',
    lineage: 'hidden',
    harvestDate: 'hidden',
    growthMedium: 'hidden',
    certifications: 'required',
    thc: 'required',
    cbd: 'optional',
    terpenes: 'hidden',
    budSizes: 'hidden',
    upcomingQty: 'optional',
    minQtyRequest: 'optional',
    images: 'optional',
    coaFiles: 'required',
  },
  edibles: {
    type: 'hidden',
    lineage: 'hidden',
    harvestDate: 'hidden',
    growthMedium: 'hidden',
    certifications: 'required',
    thc: 'optional',
    cbd: 'optional',
    terpenes: 'hidden',
    budSizes: 'hidden',
    upcomingQty: 'optional',
    minQtyRequest: 'optional',
    images: 'optional',
    coaFiles: 'required',
  },
  other: {
    type: 'optional',
    lineage: 'required',
    harvestDate: 'optional',
    growthMedium: 'hidden',
    certifications: 'required',
    thc: 'required',
    cbd: 'required',
    terpenes: 'required',
    budSizes: 'hidden',
    upcomingQty: 'optional',
    minQtyRequest: 'optional',
    images: 'optional',
    coaFiles: 'required',
  },
};

/** Per-group label overrides for fields whose meaning changes by category. */
export interface LabelOverrides {
  gramsAvailable: string;
  bidMinimum: string;
  minOrderQty: string;
}

const DEFAULT_LABELS: LabelOverrides = {
  gramsAvailable: 'Grams Available',
  bidMinimum: 'Bid Minimum Per Gram (CAD)',
  minOrderQty: 'Min Order Quantity (g)',
};

const GROUP_LABELS: Record<CategoryGroup, Partial<LabelOverrides>> = {
  flower: {},
  concentrates: {},
  edibles: {
    gramsAvailable: 'Units Available',
    bidMinimum: 'Bid Minimum / Unit (CAD)',
    minOrderQty: 'Min Order Quantity (units)',
  },
  other: {
    gramsAvailable: 'Plants Available',
    bidMinimum: 'Bid Minimum / Plant (CAD)',
    minOrderQty: 'Min Order Quantity (plants)',
  },
};

/** Returns the category group for a given category string, or null if unknown/empty. */
export function getCategoryGroup(category: string): CategoryGroup | null {
  if (!category) return null;
  return CATEGORY_GROUP_MAP[category] ?? null;
}

/** Returns field visibility config for a given category, or null if no category selected. */
export function getFieldConfig(category: string): FieldConfig | null {
  const group = getCategoryGroup(category);
  if (!group) return null;
  return GROUP_FIELDS[group];
}

/** Returns label overrides for a given category (defaults for flower/concentrates). */
export function getGroupLabels(category: string): LabelOverrides {
  const group = getCategoryGroup(category);
  if (!group) return DEFAULT_LABELS;
  return { ...DEFAULT_LABELS, ...GROUP_LABELS[group] };
}
