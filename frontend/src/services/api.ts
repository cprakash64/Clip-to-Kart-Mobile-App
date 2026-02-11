const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

if (!API_BASE_URL) {
  console.warn('EXPO_PUBLIC_BACKEND_URL is not set, using default');
}

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE_URL}/api${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(error.detail || error.message || 'Request failed');
    }

    return response.json();
  }

  // Auth endpoints
  async login(email: string, password: string) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(email: string, password: string, name: string) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  }

  async getMe() {
    return this.request('/auth/me');
  }

  // Recipe endpoints
  async extractRecipe(videoUrl: string) {
    return this.request('/recipes/extract', {
      method: 'POST',
      body: JSON.stringify({ video_url: videoUrl }),
    });
  }

  async getRecipes() {
    return this.request('/recipes');
  }

  async getRecipe(recipeId: string) {
    return this.request(`/recipes/${recipeId}`);
  }

  async deleteRecipe(recipeId: string) {
    return this.request(`/recipes/${recipeId}`, {
      method: 'DELETE',
    });
  }

  async toggleIngredient(recipeId: string, ingredientIndex: number) {
    return this.request(`/recipes/${recipeId}/ingredients/${ingredientIndex}/toggle`, {
      method: 'PATCH',
    });
  }

  // Meal plan endpoints
  async addToMealPlan(recipeId: string, date: string, mealType: string) {
    return this.request(`/meal-plan?recipe_id=${recipeId}&date=${date}&meal_type=${mealType}`, {
      method: 'POST',
    });
  }

  async getMealPlan(startDate?: string, endDate?: string) {
    let url = '/meal-plan';
    const params = [];
    if (startDate) params.push(`start_date=${startDate}`);
    if (endDate) params.push(`end_date=${endDate}`);
    if (params.length > 0) url += '?' + params.join('&');
    return this.request(url);
  }

  async removeFromMealPlan(entryId: string) {
    return this.request(`/meal-plan/${entryId}`, {
      method: 'DELETE',
    });
  }

  // Subscription endpoints
  async upgradeSubscription(plan: string) {
    return this.request('/subscription/upgrade', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    });
  }

  async getPlans() {
    return this.request('/subscription/plans');
  }

  // Grocery Export endpoints (Chef Plan only)
  async getSupportedStores() {
    return this.request('/grocery/stores');
  }

  async exportGroceryList(recipeIds: string[], store: string = 'other', format: string = 'text') {
    return this.request('/grocery/export', {
      method: 'POST',
      body: JSON.stringify({ recipe_ids: recipeIds, store, format }),
    });
  }

  async getCombinedGroceryList(recipeIds: string[]) {
    return this.request(`/grocery/combined?recipe_ids=${recipeIds.join(',')}`);
  }
}

export const api = new ApiService();
