import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/services/api';

export default function ExtractScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [videoUrl, setVideoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [extractedRecipe, setExtractedRecipe] = useState<any>(null);

  const getRecipesRemaining = () => {
    if (!user) return 0;
    if (user.subscription_plan === 'chef') return 'Unlimited';
    return Math.max(0, 5 - (user.recipes_used_this_month || 0));
  };

  const handleExtract = async () => {
    if (!videoUrl.trim()) {
      Alert.alert('Error', 'Please enter a video URL');
      return;
    }

    // Validate URL format
    const validPlatforms = ['youtube.com', 'youtu.be', 'tiktok.com', 'instagram.com'];
    const isValidUrl = validPlatforms.some(platform => videoUrl.toLowerCase().includes(platform));
    
    if (!isValidUrl) {
      Alert.alert('Invalid URL', 'Please enter a valid YouTube, TikTok, or Instagram video URL');
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    setExtractedRecipe(null);

    try {
      const recipe = await api.extractRecipe(videoUrl);
      setExtractedRecipe(recipe);
      await refreshUser();
      setVideoUrl('');
    } catch (error: any) {
      Alert.alert('Extraction Failed', error.message || 'Could not extract recipe from this video');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    const icons: { [key: string]: string } = {
      produce: 'leaf',
      dairy: 'water',
      meat: 'nutrition',
      pantry: 'cube',
      frozen: 'snow',
      bakery: 'pizza',
      beverages: 'wine',
      other: 'ellipse',
    };
    return icons[category] || 'ellipse';
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      produce: '#4CAF50',
      dairy: '#2196F3',
      meat: '#F44336',
      pantry: '#FF9800',
      frozen: '#00BCD4',
      bakery: '#9C27B0',
      beverages: '#E91E63',
      other: '#607D8B',
    };
    return colors[category] || '#607D8B';
  };

  const groupIngredientsByCategory = (ingredients: any[]) => {
    const grouped: { [key: string]: any[] } = {};
    ingredients.forEach(ing => {
      const cat = ing.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(ing);
    });
    return grouped;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Extract Recipe</Text>
          <View style={styles.usageContainer}>
            <Ionicons name="flash" size={16} color="#FF6B35" />
            <Text style={styles.usageText}>
              {getRecipesRemaining()} recipes remaining this month
            </Text>
          </View>
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>Paste Video Link</Text>
          <Text style={styles.sectionSubtitle}>
            Supports YouTube, TikTok, and Instagram recipe videos
          </Text>
          
          <View style={styles.inputContainer}>
            <Ionicons name="link" size={20} color="#888" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="https://www.youtube.com/watch?v=..."
              placeholderTextColor="#666"
              value={videoUrl}
              onChangeText={setVideoUrl}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            {videoUrl.length > 0 && (
              <TouchableOpacity onPress={() => setVideoUrl('')}>
                <Ionicons name="close-circle" size={20} color="#888" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.extractButton, loading && styles.buttonDisabled]}
            onPress={handleExtract}
            disabled={loading}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#FFF" />
                <Text style={styles.loadingText}>Extracting ingredients...</Text>
              </View>
            ) : (
              <>
                <Ionicons name="scan" size={24} color="#FFF" />
                <Text style={styles.extractButtonText}>Extract Ingredients</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {extractedRecipe && (
          <View style={styles.resultSection}>
            <View style={styles.recipeHeader}>
              <View style={styles.platformBadge}>
                <Ionicons 
                  name={extractedRecipe.source_platform === 'youtube' ? 'logo-youtube' : 
                        extractedRecipe.source_platform === 'tiktok' ? 'musical-notes' : 'logo-instagram'} 
                  size={14} 
                  color="#FFF" 
                />
                <Text style={styles.platformText}>
                  {extractedRecipe.source_platform?.charAt(0).toUpperCase() + extractedRecipe.source_platform?.slice(1)}
                </Text>
              </View>
              <Text style={styles.recipeTitle}>{extractedRecipe.title}</Text>
              <View style={styles.recipeInfo}>
                {extractedRecipe.prep_time && (
                  <View style={styles.infoItem}>
                    <Ionicons name="time-outline" size={14} color="#888" />
                    <Text style={styles.infoText}>Prep: {extractedRecipe.prep_time}</Text>
                  </View>
                )}
                {extractedRecipe.cook_time && (
                  <View style={styles.infoItem}>
                    <Ionicons name="flame-outline" size={14} color="#888" />
                    <Text style={styles.infoText}>Cook: {extractedRecipe.cook_time}</Text>
                  </View>
                )}
                <View style={styles.infoItem}>
                  <Ionicons name="people-outline" size={14} color="#888" />
                  <Text style={styles.infoText}>{extractedRecipe.servings} servings</Text>
                </View>
              </View>
            </View>

            <Text style={styles.ingredientsTitle}>
              Grocery List ({extractedRecipe.ingredients?.length || 0} items)
            </Text>

            {Object.entries(groupIngredientsByCategory(extractedRecipe.ingredients || [])).map(([category, ingredients]) => (
              <View key={category} style={styles.categorySection}>
                <View style={[styles.categoryHeader, { backgroundColor: getCategoryColor(category) + '20' }]}>
                  <Ionicons 
                    name={getCategoryIcon(category) as any} 
                    size={18} 
                    color={getCategoryColor(category)} 
                  />
                  <Text style={[styles.categoryTitle, { color: getCategoryColor(category) }]}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </Text>
                  <Text style={styles.categoryCount}>{ingredients.length}</Text>
                </View>
                {ingredients.map((ing: any, index: number) => (
                  <View key={index} style={styles.ingredientItem}>
                    <View style={styles.ingredientCheckbox}>
                      <Ionicons name="square-outline" size={20} color="#666" />
                    </View>
                    <Text style={styles.ingredientName}>{ing.name}</Text>
                    <Text style={styles.ingredientQuantity}>
                      {ing.quantity} {ing.unit}
                    </Text>
                  </View>
                ))}
              </View>
            ))}

            <TouchableOpacity
              style={styles.viewRecipeButton}
              onPress={() => router.push('/(tabs)/recipes')}
            >
              <Ionicons name="book" size={20} color="#FF6B35" />
              <Text style={styles.viewRecipeText}>View in My Recipes</Text>
            </TouchableOpacity>
          </View>
        )}

        {!extractedRecipe && !loading && (
          <View style={styles.tipsSection}>
            <Text style={styles.tipsTitle}>Tips for best results</Text>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.tipText}>Use videos with clear ingredient lists</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.tipText}>Recipe videos work better than vlogs</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.tipText}>English content provides best accuracy</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A2E',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  usageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  usageText: {
    fontSize: 14,
    color: '#888',
  },
  inputSection: {
    padding: 20,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252542',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#FFF',
    fontSize: 14,
  },
  extractButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  extractButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#FFF',
    fontSize: 16,
  },
  resultSection: {
    padding: 20,
    paddingTop: 0,
  },
  recipeHeader: {
    backgroundColor: '#252542',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B35',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
    marginBottom: 12,
  },
  platformText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  recipeTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  recipeInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#888',
  },
  ingredientsTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 16,
  },
  categorySection: {
    marginBottom: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    gap: 8,
  },
  categoryTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  categoryCount: {
    fontSize: 14,
    color: '#888',
  },
  ingredientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#252542',
  },
  ingredientCheckbox: {
    marginRight: 12,
  },
  ingredientName: {
    flex: 1,
    fontSize: 15,
    color: '#FFF',
  },
  ingredientQuantity: {
    fontSize: 14,
    color: '#888',
  },
  viewRecipeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
  },
  viewRecipeText: {
    color: '#FF6B35',
    fontSize: 16,
    fontWeight: '600',
  },
  tipsSection: {
    padding: 20,
    backgroundColor: '#252542',
    marginHorizontal: 20,
    borderRadius: 16,
    marginTop: 20,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 16,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  tipText: {
    fontSize: 14,
    color: '#CCC',
  },
});
