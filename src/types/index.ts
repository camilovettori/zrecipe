export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "enterprise";
  createdAt: string;
  updatedAt: string;
}

export interface TenantUser {
  id: string;
  tenantId: string;
  userId: string;
  role: "owner" | "admin" | "member" | "viewer";
  createdAt: string;
}

export interface Supplier {
  id: string;
  tenantId: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  tenantId: string;
  supplierId: string;
  supplier?: Supplier;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  status: "pending" | "processed" | "paid" | "cancelled";
  totalAmount: number;
  currency: string;
  notes?: string;
  items?: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  ingredientId?: string;
  ingredient?: Ingredient;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

export interface Ingredient {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  category?: string;
  baseUnit: string;
  currentPrice?: number;
  currency: string;
  supplierId?: string;
  supplier?: Supplier;
  priceHistory?: IngredientPriceHistory[];
  createdAt: string;
  updatedAt: string;
}

export interface IngredientPriceHistory {
  id: string;
  ingredientId: string;
  supplierId?: string;
  supplier?: Supplier;
  price: number;
  unit: string;
  currency: string;
  effectiveDate: string;
  invoiceId?: string;
  createdAt: string;
}

export interface Recipe {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  category?: string;
  yield: number;
  yieldUnit: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  instructions?: string;
  notes?: string;
  isActive: boolean;
  ingredients?: RecipeIngredient[];
  cost?: RecipeCost;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  ingredientId: string;
  ingredient?: Ingredient;
  quantity: number;
  unit: string;
  notes?: string;
  isOptional: boolean;
}

export interface RecipeCost {
  recipeId: string;
  totalIngredientCost: number;
  costPerServing?: number;
  costPerYieldUnit: number;
  currency: string;
  calculatedAt: string;
  laborCost?: number;
  overheadCost?: number;
  totalCost: number;
  suggestedPrice?: number;
  foodCostPercentage?: number;
}
