import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useRevenueCat, usePurchaseActions } from '../../src/context/RevenueCatContext';
import { api } from '../../src/services/api';
import SubscriptionModal from '../../src/components/SubscriptionModal';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PlannerScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { isChefPlan: rcIsChefPlan } = useRevenueCat();
  const { presentPaywall, purchasing } = usePurchaseActions();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [mealPlan, setMealPlan] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  // Use RevenueCat status on mobile, fallback to backend status on web
  const isChefPlan = Platform.OS === 'web' 
    ? user?.subscription_plan === 'chef' 
    : rcIsChefPlan || user?.subscription_plan === 'chef';

  useFocusEffect(
    useCallback(() => {
      if (isChefPlan) {
        loadMealPlan();
      } else {
        setLoading(false);
      }
    }, [isChefPlan])
  );

  const loadMealPlan = async () => {
    try {
      const startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      
      const data = await api.getMealPlan(
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
      setMealPlan(data);
    } catch (error) {
      console.error('Error loading meal plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    
    const days = [];
    
    // Add empty slots for days before the first day of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    
    // Add the days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };

  const getDateString = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const getMealsForDate = (date: Date) => {
    const dateStr = getDateString(date);
    return mealPlan.filter(meal => meal.date === dateStr);
  };

  const isToday = (date: Date | null) => {
    if (!date) return false;
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date: Date | null) => {
    if (!date) return false;
    return date.toDateString() === selectedDate.toDateString();
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleRemoveMeal = async (entryId: string) => {
    Alert.alert(
      'Remove from Meal Plan',
      'Are you sure you want to remove this meal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.removeFromMealPlan(entryId);
              setMealPlan(mealPlan.filter(m => m.id !== entryId));
            } catch (error) {
              Alert.alert('Error', 'Failed to remove meal');
            }
          },
        },
      ]
    );
  };

  const handleDemoUpgrade = async () => {
    setUpgrading(true);
    try {
      await api.upgradeSubscription('chef');
      await refreshUser();
      setShowSubscriptionModal(false);
      Alert.alert('Success!', 'Chef Plan activated! You can now use Meal Planning.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to upgrade');
    } finally {
      setUpgrading(false);
    }
  };

  const handleMobileSubscribe = async () => {
    setShowSubscriptionModal(false);
    const success = await presentPaywall();
    if (success) {
      try {
        await api.upgradeSubscription('chef');
        await refreshUser();
      } catch (e) {
        console.log('Backend sync will happen via webhook');
      }
      Alert.alert('Welcome to Chef Plan!', 'You can now use Meal Planning!');
    }
  };

  if (!isChefPlan) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.upgradeContainer}>
          <View style={styles.upgradeIcon}>
            <Ionicons name="calendar" size={64} color="#FF6B35" />
          </View>
          <Text style={styles.upgradeTitle}>Meal Planning</Text>
          <Text style={styles.upgradeSubtitle}>
            Plan your meals for the week and generate combined grocery lists!
          </Text>
          
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.featureText}>Weekly meal calendar</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.featureText}>Drag & drop recipes</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.featureText}>Combined shopping lists</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.featureText}>Unlimited recipe extractions</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.upgradeButton, (purchasing || upgrading) && styles.upgradeButtonDisabled]}
            onPress={() => setShowSubscriptionModal(true)}
            disabled={purchasing || upgrading}
          >
            {(purchasing || upgrading) ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Text style={styles.upgradeButtonText}>Upgrade to Chef Plan</Text>
                <Text style={styles.upgradePriceText}>$9.99/month</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <SubscriptionModal
          visible={showSubscriptionModal}
          onClose={() => setShowSubscriptionModal(false)}
          onSubscribe={Platform.OS === 'web' ? handleDemoUpgrade : handleMobileSubscribe}
          onDemoUpgrade={handleDemoUpgrade}
          loading={upgrading || purchasing}
          price="$9.99"
        />
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

  const selectedDateMeals = getMealsForDate(selectedDate);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Meal Planner</Text>
          <Text style={styles.headerSubtitle}>Plan your weekly meals</Text>
        </View>

        <View style={styles.calendarContainer}>
          <View style={styles.monthHeader}>
            <TouchableOpacity onPress={handlePrevMonth}>
              <Ionicons name="chevron-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>
              {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </Text>
            <TouchableOpacity onPress={handleNextMonth}>
              <Ionicons name="chevron-forward" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekDays}>
            {DAYS.map(day => (
              <Text key={day} style={styles.weekDayText}>{day}</Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {getDaysInMonth().map((date, index) => {
              const hasMeals = date && getMealsForDate(date).length > 0;
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.dayCell,
                    isSelected(date) && styles.dayCellSelected,
                    isToday(date) && styles.dayCellToday,
                  ]}
                  onPress={() => date && setSelectedDate(date)}
                  disabled={!date}
                >
                  {date && (
                    <>
                      <Text
                        style={[
                          styles.dayText,
                          isSelected(date) && styles.dayTextSelected,
                          isToday(date) && styles.dayTextToday,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                      {hasMeals && (
                        <View style={styles.mealIndicator} />
                      )}
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.selectedDateSection}>
          <Text style={styles.selectedDateTitle}>
            {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>

          {selectedDateMeals.length === 0 ? (
            <View style={styles.noMealsContainer}>
              <Ionicons name="restaurant-outline" size={40} color="#444" />
              <Text style={styles.noMealsText}>No meals planned for this day</Text>
              <Text style={styles.noMealsSubtext}>
                Go to My Recipes to add meals to your plan
              </Text>
            </View>
          ) : (
            selectedDateMeals.map(meal => (
              <View key={meal.id} style={styles.mealCard}>
                <View style={styles.mealCardContent}>
                  <View style={styles.mealTypeTag}>
                    <Text style={styles.mealTypeText}>{meal.meal_type}</Text>
                  </View>
                  <Text style={styles.mealTitle}>{meal.recipe_title}</Text>
                </View>
                <TouchableOpacity
                  style={styles.removeMealButton}
                  onPress={() => handleRemoveMeal(meal.id)}
                >
                  <Ionicons name="close" size={20} color="#888" />
                </TouchableOpacity>
              </View>
            ))
          )}
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
  calendarContainer: {
    backgroundColor: '#252542',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  weekDays: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDayText: {
    flex: 1,
    textAlign: 'center',
    color: '#888',
    fontSize: 12,
    fontWeight: '500',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: {
    backgroundColor: '#FF6B35',
    borderRadius: 20,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: '#FF6B35',
    borderRadius: 20,
  },
  dayText: {
    color: '#FFF',
    fontSize: 14,
  },
  dayTextSelected: {
    fontWeight: '600',
  },
  dayTextToday: {
    color: '#FF6B35',
  },
  mealIndicator: {
    position: 'absolute',
    bottom: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4CAF50',
  },
  selectedDateSection: {
    padding: 20,
  },
  selectedDateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 16,
  },
  noMealsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noMealsText: {
    fontSize: 16,
    color: '#888',
    marginTop: 12,
  },
  noMealsSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252542',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  mealCardContent: {
    flex: 1,
  },
  mealTypeTag: {
    backgroundColor: '#FF6B35',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  mealTypeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
    textTransform: 'capitalize',
  },
  mealTitle: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '500',
  },
  removeMealButton: {
    padding: 8,
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
    fontSize: 16,
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
