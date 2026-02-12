import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../src/context/AuthContext';
import { useRevenueCat, usePurchaseActions } from '../../src/context/RevenueCatContext';
import { api } from '../../src/services/api';

interface Store {
  id: string;
  name: string;
  icon: string;
  color: string;
  has_deep_link: boolean;
}

interface Recipe {
  id: string;
  title: string;
  ingredients: any[];
}

export default function CartScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { isChefPlan: rcIsChefPlan } = useRevenueCat();
  const { presentPaywall, purchasing } = usePurchaseActions();
  const [stores, setStores] = useState<Store[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipes, setSelectedRecipes] = useState<Set<string>>(new Set());
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportedList, setExportedList] = useState<string | null>(null);

  // Use RevenueCat status on mobile, fallback to backend status on web
  const isChefPlan = Platform.OS === 'web' 
    ? user?.subscription_plan === 'chef' 
    : rcIsChefPlan || user?.subscription_plan === 'chef';

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const [storesData, recipesData] = await Promise.all([
        api.getSupportedStores(),
        api.getRecipes(),
      ]);
      setStores(storesData.stores);
      setRecipes(recipesData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleRecipeSelection = (recipeId: string) => {
    const newSelected = new Set(selectedRecipes);
    if (newSelected.has(recipeId)) {
      newSelected.delete(recipeId);
    } else {
      newSelected.add(recipeId);
    }
    setSelectedRecipes(newSelected);
    setExportedList(null);
  };

  const selectAllRecipes = () => {
    if (selectedRecipes.size === recipes.length) {
      setSelectedRecipes(new Set());
    } else {
      setSelectedRecipes(new Set(recipes.map(r => r.id)));
    }
    setExportedList(null);
  };

  const handleExport = async () => {
    if (selectedRecipes.size === 0) {
      Alert.alert('No Recipes Selected', 'Please select at least one recipe to export.');
      return;
    }

    if (!selectedStore) {
      Alert.alert('No Store Selected', 'Please select a store or "Copy List" option.');
      return;
    }

    setExporting(true);
    try {
      const result = await api.exportGroceryList(
        Array.from(selectedRecipes),
        selectedStore,
        'text'
      );
      setExportedList(result.text);
      
      // Auto copy to clipboard
      await Clipboard.setStringAsync(result.text);
      
      Alert.alert(
        'Grocery List Ready!',
        'Your list has been copied to clipboard. You can now paste it in your shopping app.',
        [
          { text: 'OK' },
          ...(result.store_info?.web_url ? [{
            text: `Open ${stores.find(s => s.id === selectedStore)?.name || 'Store'}`,
            onPress: () => openStore(result.store_info.web_url, result.store_info.deep_link)
          }] : [])
        ]
      );
    } catch (error: any) {
      Alert.alert('Export Failed', error.message);
    } finally {
      setExporting(false);
    }
  };

  const openStore = async (webUrl: string, deepLink: string | null) => {
    try {
      if (deepLink && Platform.OS !== 'web') {
        const canOpen = await Linking.canOpenURL(deepLink);
        if (canOpen) {
          await Linking.openURL(deepLink);
          return;
        }
      }
      if (webUrl) {
        await Linking.openURL(webUrl);
      }
    } catch (error) {
      console.error('Error opening store:', error);
    }
  };

  const copyToClipboard = async () => {
    if (exportedList) {
      await Clipboard.setStringAsync(exportedList);
      Alert.alert('Copied!', 'Grocery list copied to clipboard.');
    }
  };

  const getStoreIcon = (iconName: string) => {
    const iconMap: { [key: string]: any } = {
      'cart': 'cart',
      'storefront': 'storefront',
      'logo-amazon': 'logo-amazon',
      'basket': 'basket',
      'radio-button-on': 'radio-button-on',
      'copy': 'copy',
    };
    return iconMap[iconName] || 'cart';
  };

  if (!isChefPlan) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.upgradeContainer}>
          <View style={styles.upgradeIcon}>
            <Ionicons name="cart" size={64} color="#FF6B35" />
          </View>
          <Text style={styles.upgradeTitle}>Add to Cart</Text>
          <Text style={styles.upgradeSubtitle}>
            Export your grocery lists directly to your favorite shopping app!
          </Text>
          
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.featureText}>Export to Walmart, Instacart, Amazon Fresh</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.featureText}>Combine multiple recipes</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.featureText}>Auto-deduplicate ingredients</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.featureText}>Categorized shopping lists</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.upgradeButton, purchasing && styles.upgradeButtonDisabled]}
            onPress={async () => {
              const success = await purchaseChefPlan();
              if (success) {
                Alert.alert('Welcome to Chef Plan!', 'You can now use the Add to Cart feature!');
              }
            }}
            disabled={purchasing}
          >
            {purchasing ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Text style={styles.upgradeButtonText}>Upgrade to Chef Plan</Text>
                <Text style={styles.upgradePriceText}>$9.99/month</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Add to Cart</Text>
          <Text style={styles.headerSubtitle}>Export grocery lists to your favorite store</Text>
        </View>

        {/* Recipe Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Select Recipes</Text>
            <TouchableOpacity onPress={selectAllRecipes}>
              <Text style={styles.selectAllText}>
                {selectedRecipes.size === recipes.length ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
          </View>

          {recipes.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="book-outline" size={40} color="#444" />
              <Text style={styles.emptyText}>No recipes yet</Text>
              <Text style={styles.emptySubtext}>Extract some recipes first!</Text>
            </View>
          ) : (
            recipes.map((recipe) => (
              <TouchableOpacity
                key={recipe.id}
                style={[
                  styles.recipeItem,
                  selectedRecipes.has(recipe.id) && styles.recipeItemSelected
                ]}
                onPress={() => toggleRecipeSelection(recipe.id)}
              >
                <View style={[
                  styles.checkbox,
                  selectedRecipes.has(recipe.id) && styles.checkboxChecked
                ]}>
                  {selectedRecipes.has(recipe.id) && (
                    <Ionicons name="checkmark" size={16} color="#FFF" />
                  )}
                </View>
                <View style={styles.recipeItemContent}>
                  <Text style={styles.recipeItemTitle} numberOfLines={1}>
                    {recipe.title}
                  </Text>
                  <Text style={styles.recipeItemInfo}>
                    {recipe.ingredients?.length || 0} ingredients
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Store Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Store</Text>
          <View style={styles.storesGrid}>
            {stores.map((store) => (
              <TouchableOpacity
                key={store.id}
                style={[
                  styles.storeCard,
                  selectedStore === store.id && styles.storeCardSelected,
                  { borderColor: selectedStore === store.id ? store.color : '#333' }
                ]}
                onPress={() => {
                  setSelectedStore(store.id);
                  setExportedList(null);
                }}
              >
                <View style={[styles.storeIcon, { backgroundColor: store.color + '20' }]}>
                  <Ionicons
                    name={getStoreIcon(store.icon) as any}
                    size={24}
                    color={store.color}
                  />
                </View>
                <Text style={styles.storeName}>{store.name}</Text>
                {selectedStore === store.id && (
                  <View style={[styles.storeCheckmark, { backgroundColor: store.color }]}>
                    <Ionicons name="checkmark" size={12} color="#FFF" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Export Button */}
        <TouchableOpacity
          style={[
            styles.exportButton,
            (selectedRecipes.size === 0 || !selectedStore || exporting) && styles.exportButtonDisabled
          ]}
          onPress={handleExport}
          disabled={selectedRecipes.size === 0 || !selectedStore || exporting}
        >
          {exporting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="download-outline" size={24} color="#FFF" />
              <Text style={styles.exportButtonText}>
                Generate Grocery List ({selectedRecipes.size} recipe{selectedRecipes.size !== 1 ? 's' : ''})
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Exported List Preview */}
        {exportedList && (
          <View style={styles.previewSection}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>Your Grocery List</Text>
              <TouchableOpacity onPress={copyToClipboard} style={styles.copyButton}>
                <Ionicons name="copy-outline" size={18} color="#FF6B35" />
                <Text style={styles.copyButtonText}>Copy</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.previewContent}>
              <Text style={styles.previewText}>{exportedList}</Text>
            </View>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Tip: After copying, open your shopping app and paste the list to quickly add items to your cart.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A2E',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    padding: 20,
    paddingTop: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  section: {
    padding: 20,
    paddingTop: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
  },
  selectAllText: {
    color: '#FF6B35',
    fontSize: 14,
    fontWeight: '500',
  },
  recipeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252542',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  recipeItemSelected: {
    borderColor: '#FF6B35',
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#666',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  checkboxChecked: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  recipeItemContent: {
    flex: 1,
  },
  recipeItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFF',
  },
  recipeItemInfo: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  storesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  storeCard: {
    width: '30%',
    marginHorizontal: '1.66%',
    backgroundColor: '#252542',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    position: 'relative',
  },
  storeCardSelected: {
    backgroundColor: 'rgba(255, 107, 53, 0.05)',
  },
  storeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  storeName: {
    fontSize: 12,
    color: '#FFF',
    textAlign: 'center',
    fontWeight: '500',
  },
  storeCheckmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B35',
    marginHorizontal: 20,
    borderRadius: 12,
    height: 56,
    gap: 10,
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  previewSection: {
    margin: 20,
    backgroundColor: '#252542',
    borderRadius: 16,
    overflow: 'hidden',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  copyButtonText: {
    color: '#FF6B35',
    fontSize: 14,
    fontWeight: '500',
  },
  previewContent: {
    padding: 16,
    maxHeight: 300,
  },
  previewText: {
    color: '#CCC',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 20,
  },
  footer: {
    padding: 20,
    paddingTop: 0,
  },
  footerText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#252542',
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  upgradeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  upgradeIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  upgradeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  upgradeSubtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 32,
  },
  featureList: {
    alignSelf: 'stretch',
    gap: 12,
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 15,
    color: '#CCC',
  },
  upgradeButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  upgradeButtonDisabled: {
    opacity: 0.7,
  },
  upgradeButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  upgradePriceText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 4,
  },
});
