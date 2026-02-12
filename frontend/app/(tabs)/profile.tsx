import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useRevenueCat, useSubscriptionStatus, usePurchaseActions } from '../../src/context/RevenueCatContext';
import { api } from '../../src/services/api';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, refreshUser } = useAuth();
  const { 
    isChefPlan: rcIsChefPlan, 
    offerings,
    identifyUser,
    logoutUser,
  } = useRevenueCat();
  const { isChefPlan: subscriptionIsChef, expirationDate, willRenew } = useSubscriptionStatus();
  const { presentPaywall, restorePurchases, purchasing, hasOfferings } = usePurchaseActions();
  
  const [upgrading, setUpgrading] = useState(false);

  // Use RevenueCat status on mobile, fallback to backend status on web
  const isChefPlan = Platform.OS === 'web' 
    ? user?.subscription_plan === 'chef' 
    : rcIsChefPlan || user?.subscription_plan === 'chef';
  
  const recipesUsed = user?.recipes_used_this_month || 0;
  const recipesLimit = isChefPlan ? 'Unlimited' : 5;

  // Identify user with RevenueCat when logged in
  useEffect(() => {
    if (user?.id && Platform.OS !== 'web') {
      identifyUser(user.id);
    }
  }, [user?.id, identifyUser]);

  // Get price from RevenueCat offerings
  const getPrice = () => {
    if (Platform.OS === 'web') return '$9.99';
    const pkg = offerings?.current?.availablePackages?.find(
      p => p.packageType === 'MONTHLY' || p.identifier === '$rc_monthly' || p.identifier === 'monthly'
    );
    if (pkg) {
      return pkg.product.priceString || `$${pkg.product.price}`;
    }
    return '$9.99';
  };

  const handleSubscribe = async () => {
    if (Platform.OS === 'web') {
      // Web fallback - use browser confirm dialog for demo upgrade
      const shouldUpgrade = window.confirm(
        'In-app purchases are available on the iOS and Android apps.\n\nWould you like to activate a demo Chef Plan to try the features?'
      );
      
      if (shouldUpgrade) {
        setUpgrading(true);
        try {
          await api.upgradeSubscription('chef');
          await refreshUser();
          window.alert('Success! Demo Chef Plan activated. Download the mobile app for real subscriptions.');
        } catch (error: any) {
          window.alert('Error: ' + (error.message || 'Failed to upgrade'));
        } finally {
          setUpgrading(false);
        }
      }
      return;
    }

    // Use RevenueCat Paywall for mobile
    const success = await presentPaywall();
    
    if (success) {
      // Sync with backend
      try {
        await api.upgradeSubscription('chef');
        await refreshUser();
      } catch (error) {
        console.log('Backend sync will happen via webhook');
      }
      
      Alert.alert(
        'Welcome to Chef Plan! 🎉',
        'You now have unlimited recipe extractions, meal planning, Add to Cart, and more!',
        [{ text: 'Awesome!' }]
      );
    }
  };

  const handleRestore = async () => {
    const success = await restorePurchases();
    
    if (success) {
      // Sync with backend
      try {
        await api.upgradeSubscription('chef');
        await refreshUser();
      } catch (error) {
        console.log('Backend sync will happen via webhook');
      }
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            // Logout from RevenueCat
            if (Platform.OS !== 'web') {
              await logoutUser();
            }
            // Logout from app
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  // Format expiration date
  const formatExpirationDate = () => {
    if (!expirationDate) return null;
    return expirationDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <View style={[styles.planBadge, isChefPlan && styles.chefPlanBadge]}>
            <Ionicons
              name={isChefPlan ? 'star' : 'person'}
              size={14}
              color={isChefPlan ? '#FFD700' : '#FFF'}
            />
            <Text style={[styles.planBadgeText, isChefPlan && styles.chefPlanBadgeText]}>
              {isChefPlan ? 'Chef Plan' : 'Normal Plan'}
            </Text>
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{recipesUsed}</Text>
            <Text style={styles.statLabel}>Recipes Used</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{recipesLimit}</Text>
            <Text style={styles.statLabel}>Monthly Limit</Text>
          </View>
        </View>

        {!isChefPlan && (
          <View style={styles.upgradeCard}>
            <View style={styles.upgradeHeader}>
              <Ionicons name="star" size={24} color="#FFD700" />
              <Text style={styles.upgradeTitle}>Upgrade to Chef Plan</Text>
            </View>
            <Text style={styles.upgradeDescription}>
              Get unlimited recipe extractions and access to premium features!
            </Text>
            
            <View style={styles.upgradeFeatures}>
              <View style={styles.upgradeFeatureItem}>
                <Ionicons name="infinite" size={16} color="#4CAF50" />
                <Text style={styles.upgradeFeatureText}>Unlimited recipe extractions</Text>
              </View>
              <View style={styles.upgradeFeatureItem}>
                <Ionicons name="calendar" size={16} color="#4CAF50" />
                <Text style={styles.upgradeFeatureText}>Meal planning calendar</Text>
              </View>
              <View style={styles.upgradeFeatureItem}>
                <Ionicons name="cart" size={16} color="#4CAF50" />
                <Text style={styles.upgradeFeatureText}>Add to Cart feature</Text>
              </View>
              <View style={styles.upgradeFeatureItem}>
                <Ionicons name="download" size={16} color="#4CAF50" />
                <Text style={styles.upgradeFeatureText}>Export grocery lists</Text>
              </View>
            </View>

            <View style={styles.priceContainer}>
              <Text style={styles.priceText}>{getPrice()}</Text>
              <Text style={styles.pricePeriod}>/month</Text>
            </View>

            <TouchableOpacity
              style={[styles.subscribeButton, (purchasing || upgrading) && styles.buttonDisabled]}
              onPress={handleSubscribe}
              disabled={purchasing || upgrading}
            >
              {(purchasing || upgrading) ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="card" size={20} color="#FFF" />
                  <Text style={styles.subscribeButtonText}>Subscribe Now</Text>
                </>
              )}
            </TouchableOpacity>

            {Platform.OS !== 'web' && (
              <TouchableOpacity
                style={styles.restoreButton}
                onPress={handleRestore}
                disabled={purchasing}
              >
                <Text style={styles.restoreButtonText}>Restore Purchases</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.legalText}>
              {Platform.OS === 'web' 
                ? 'Full subscription features available on iOS and Android apps.'
                : `Subscription automatically renews monthly. Cancel anytime in ${Platform.OS === 'ios' ? 'App Store' : 'Google Play'} settings.`
              }
            </Text>
          </View>
        )}

        {isChefPlan && (
          <View style={styles.chefBenefits}>
            <View style={styles.benefitHeader}>
              <Ionicons name="star" size={20} color="#FFD700" />
              <Text style={styles.benefitTitle}>Chef Plan Active</Text>
            </View>
            
            {expirationDate && (
              <View style={styles.subscriptionInfo}>
                <Text style={styles.subscriptionInfoLabel}>
                  {willRenew ? 'Renews on' : 'Expires on'}:
                </Text>
                <Text style={styles.subscriptionInfoValue}>
                  {formatExpirationDate()}
                </Text>
              </View>
            )}
            
            <View style={styles.benefitItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.benefitText}>Unlimited recipe extractions</Text>
            </View>
            <View style={styles.benefitItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.benefitText}>Meal planning calendar</Text>
            </View>
            <View style={styles.benefitItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.benefitText}>Add to Cart feature</Text>
            </View>
            <View style={styles.benefitItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.benefitText}>Export grocery lists</Text>
            </View>
            <View style={styles.benefitItem}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.benefitText}>Priority support</Text>
            </View>

            <Text style={styles.manageText}>
              {Platform.OS === 'web' 
                ? 'Manage your subscription in the mobile app settings'
                : `Manage subscription in ${Platform.OS === 'ios' ? 'App Store' : 'Google Play'} settings`
              }
            </Text>
          </View>
        )}

        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: '#2196F320' }]}>
                <Ionicons name="help-circle-outline" size={20} color="#2196F3" />
              </View>
              <Text style={styles.menuItemText}>Help & Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: '#9C27B020' }]}>
                <Ionicons name="document-text-outline" size={20} color="#9C27B0" />
              </View>
              <Text style={styles.menuItemText}>Terms of Service</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: '#00968820' }]}>
                <Ionicons name="shield-outline" size={20} color="#009688" />
              </View>
              <Text style={styles.menuItemText}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#F44336" />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Version 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A2E',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#FFF',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#252542',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chefPlanBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  planBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  chefPlanBadgeText: {
    color: '#FFD700',
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#252542',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#1A1A2E',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF6B35',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  upgradeCard: {
    backgroundColor: '#252542',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  upgradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  upgradeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  upgradeDescription: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
  },
  upgradeFeatures: {
    gap: 10,
    marginBottom: 20,
  },
  upgradeFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  upgradeFeatureText: {
    fontSize: 14,
    color: '#CCC',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 16,
  },
  priceText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFF',
  },
  pricePeriod: {
    fontSize: 16,
    color: '#888',
    marginLeft: 4,
  },
  subscribeButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  subscribeButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  restoreButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  restoreButtonText: {
    color: '#888',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  legalText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
  chefBenefits: {
    backgroundColor: '#252542',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  benefitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  benefitTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFD700',
  },
  subscriptionInfo: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  subscriptionInfoLabel: {
    fontSize: 12,
    color: '#888',
  },
  subscriptionInfoValue: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: '600',
    marginTop: 2,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  benefitText: {
    fontSize: 14,
    color: '#CCC',
  },
  manageText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
  },
  menuSection: {
    backgroundColor: '#252542',
    marginHorizontal: 20,
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    fontSize: 16,
    color: '#FFF',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderRadius: 12,
    marginBottom: 20,
  },
  logoutButtonText: {
    color: '#F44336',
    fontSize: 16,
    fontWeight: '600',
  },
  versionText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 12,
    marginBottom: 40,
  },
});
