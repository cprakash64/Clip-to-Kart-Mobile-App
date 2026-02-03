import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api } from '../../src/services/api';

export default function RecipesScreen() {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);

  const loadRecipes = async () => {
    try {
      const data = await api.getRecipes();
      setRecipes(data);
    } catch (error: any) {
      console.error('Error loading recipes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadRecipes();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadRecipes();
  };

  const handleDelete = (recipeId: string) => {
    Alert.alert(
      'Delete Recipe',
      'Are you sure you want to delete this recipe?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteRecipe(recipeId);
              setRecipes(recipes.filter(r => r.id !== recipeId));
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete recipe');
            }
          },
        },
      ]
    );
  };

  const toggleIngredient = async (recipeId: string, index: number) => {
    try {
      await api.toggleIngredient(recipeId, index);
      setRecipes(recipes.map(recipe => {
        if (recipe.id === recipeId) {
          const newIngredients = [...recipe.ingredients];
          newIngredients[index] = {
            ...newIngredients[index],
            checked: !newIngredients[index].checked,
          };
          return { ...recipe, ingredients: newIngredients };
        }
        return recipe;
      }));
    } catch (error) {
      console.error('Error toggling ingredient:', error);
    }
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

  const renderRecipe = ({ item }: { item: any }) => {
    const isExpanded = expandedRecipe === item.id;
    const checkedCount = item.ingredients?.filter((i: any) => i.checked).length || 0;
    const totalCount = item.ingredients?.length || 0;

    return (
      <View style={styles.recipeCard}>
        <TouchableOpacity
          style={styles.recipeHeader}
          onPress={() => setExpandedRecipe(isExpanded ? null : item.id)}
        >
          <View style={styles.recipeHeaderLeft}>
            <View style={styles.platformIcon}>
              <Ionicons
                name={item.source_platform === 'youtube' ? 'logo-youtube' :
                      item.source_platform === 'tiktok' ? 'musical-notes' : 'logo-instagram'}
                size={16}
                color="#FFF"
              />
            </View>
            <View style={styles.recipeInfo}>
              <Text style={styles.recipeTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.recipeDate}>
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
          <View style={styles.recipeHeaderRight}>
            <View style={styles.progressContainer}>
              <Text style={styles.progressText}>{checkedCount}/{totalCount}</Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: totalCount > 0 ? `${(checkedCount / totalCount) * 100}%` : '0%' },
                  ]}
                />
              </View>
            </View>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#888"
            />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.recipeContent}>
            <View style={styles.recipeStats}>
              {item.prep_time && (
                <View style={styles.statItem}>
                  <Ionicons name="time-outline" size={14} color="#888" />
                  <Text style={styles.statText}>Prep: {item.prep_time}</Text>
                </View>
              )}
              {item.cook_time && (
                <View style={styles.statItem}>
                  <Ionicons name="flame-outline" size={14} color="#888" />
                  <Text style={styles.statText}>Cook: {item.cook_time}</Text>
                </View>
              )}
              <View style={styles.statItem}>
                <Ionicons name="people-outline" size={14} color="#888" />
                <Text style={styles.statText}>{item.servings} servings</Text>
              </View>
            </View>

            <Text style={styles.ingredientsSectionTitle}>Grocery List</Text>
            {item.ingredients?.map((ingredient: any, index: number) => (
              <TouchableOpacity
                key={index}
                style={styles.ingredientRow}
                onPress={() => toggleIngredient(item.id, index)}
              >
                <View
                  style={[
                    styles.checkbox,
                    ingredient.checked && styles.checkboxChecked,
                  ]}
                >
                  {ingredient.checked && (
                    <Ionicons name="checkmark" size={14} color="#FFF" />
                  )}
                </View>
                <View
                  style={[
                    styles.categoryDot,
                    { backgroundColor: getCategoryColor(ingredient.category) },
                  ]}
                />
                <Text
                  style={[
                    styles.ingredientName,
                    ingredient.checked && styles.ingredientChecked,
                  ]}
                >
                  {ingredient.name}
                </Text>
                <Text style={styles.ingredientQuantity}>
                  {ingredient.quantity} {ingredient.unit}
                </Text>
              </TouchableOpacity>
            ))}

            {item.instructions?.length > 0 && (
              <>
                <Text style={styles.ingredientsSectionTitle}>Instructions</Text>
                {item.instructions.map((instruction: string, index: number) => (
                  <View key={index} style={styles.instructionRow}>
                    <View style={styles.instructionNumber}>
                      <Text style={styles.instructionNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.instructionText}>{instruction}</Text>
                  </View>
                ))}
              </>
            )}

            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDelete(item.id)}
            >
              <Ionicons name="trash-outline" size={18} color="#F44336" />
              <Text style={styles.deleteButtonText}>Delete Recipe</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Recipes</Text>
        <Text style={styles.headerSubtitle}>{recipes.length} saved recipes</Text>
      </View>

      {recipes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="book-outline" size={64} color="#444" />
          <Text style={styles.emptyTitle}>No recipes yet</Text>
          <Text style={styles.emptyText}>
            Extract your first recipe from a video to get started!
          </Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          renderItem={renderRecipe}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#FF6B35"
            />
          }
        />
      )}
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
  listContent: {
    padding: 20,
    paddingTop: 0,
  },
  recipeCard: {
    backgroundColor: '#252542',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  recipeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  platformIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  recipeInfo: {
    flex: 1,
  },
  recipeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  recipeDate: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  recipeHeaderRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  progressContainer: {
    alignItems: 'flex-end',
  },
  progressText: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  progressBar: {
    width: 60,
    height: 4,
    backgroundColor: '#1A1A2E',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  recipeContent: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#1A1A2E',
  },
  recipeStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 16,
    paddingTop: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 13,
    color: '#888',
  },
  ingredientsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
    marginTop: 8,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#666',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  ingredientName: {
    flex: 1,
    fontSize: 15,
    color: '#FFF',
  },
  ingredientChecked: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  ingredientQuantity: {
    fontSize: 14,
    color: '#888',
  },
  instructionRow: {
    flexDirection: 'row',
    paddingVertical: 10,
  },
  instructionNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  instructionNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: '#CCC',
    lineHeight: 20,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1A1A2E',
  },
  deleteButtonText: {
    color: '#F44336',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFF',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
  },
});
