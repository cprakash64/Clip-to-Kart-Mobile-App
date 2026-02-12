import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Platform, Alert } from 'react-native';
import Purchases, { 
  PurchasesOfferings, 
  CustomerInfo, 
  PurchasesPackage,
  LOG_LEVEL,
  PurchasesStoreProduct,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

// RevenueCat Configuration
const REVENUECAT_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY || 'test_zRPaouknyKSlpgqKoLHgpNMUQkZ';

// Entitlement and Product IDs
const CHEF_PLAN_ENTITLEMENT = 'chef_plan';
const PRODUCT_IDS = {
  monthly: 'chef_monthly',
  yearly: 'chef_yearly',
};

interface RevenueCatContextType {
  isInitialized: boolean;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOfferings | null;
  isChefPlan: boolean;
  loading: boolean;
  purchasing: boolean;
  error: string | null;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  presentPaywall: () => Promise<boolean>;
  presentPaywallIfNeeded: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refreshCustomerInfo: () => Promise<void>;
  identifyUser: (userId: string) => Promise<void>;
  logoutUser: () => Promise<void>;
  getMonthlyPackage: () => PurchasesPackage | null;
  getYearlyPackage: () => PurchasesPackage | null;
}

const RevenueCatContext = createContext<RevenueCatContextType | undefined>(undefined);

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user has Chef Plan entitlement
  const isChefPlan = customerInfo?.entitlements?.active?.[CHEF_PLAN_ENTITLEMENT]?.isActive === true;

  // Initialize RevenueCat on mount
  useEffect(() => {
    initializeRevenueCat();
  }, []);

  // Set up customer info listener
  useEffect(() => {
    if (!isInitialized || Platform.OS === 'web') return;

    const customerInfoUpdateListener = Purchases.addCustomerInfoUpdateListener((info) => {
      console.log('RevenueCat: Customer info updated');
      console.log('Active entitlements:', Object.keys(info.entitlements.active));
      setCustomerInfo(info);
    });

    return () => {
      customerInfoUpdateListener.remove();
    };
  }, [isInitialized]);

  const initializeRevenueCat = async () => {
    try {
      // Web platform doesn't support native purchases
      if (Platform.OS === 'web') {
        console.log('RevenueCat: Web platform detected - purchases will be simulated');
        setIsInitialized(true);
        setLoading(false);
        return;
      }

      console.log('RevenueCat: Initializing with API key:', REVENUECAT_API_KEY.substring(0, 10) + '...');

      // Set log level for debugging
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);

      // Configure RevenueCat
      await Purchases.configure({
        apiKey: REVENUECAT_API_KEY,
      });

      console.log('RevenueCat: SDK configured successfully');
      setIsInitialized(true);

      // Fetch initial customer info and offerings
      await Promise.all([
        fetchCustomerInfo(),
        fetchOfferings(),
      ]);

    } catch (err: any) {
      console.error('RevenueCat: Initialization error:', err);
      setError(err.message || 'Failed to initialize purchases');
      // Don't block the app if RevenueCat fails to initialize
      setIsInitialized(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerInfo = async () => {
    if (Platform.OS === 'web') return;
    
    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      console.log('RevenueCat: Customer info fetched');
      console.log('RevenueCat: Active entitlements:', Object.keys(info.entitlements.active));
      console.log('RevenueCat: All entitlements:', Object.keys(info.entitlements.all));
    } catch (err: any) {
      console.error('RevenueCat: Error fetching customer info:', err);
    }
  };

  const fetchOfferings = async () => {
    if (Platform.OS === 'web') return;
    
    try {
      const fetchedOfferings = await Purchases.getOfferings();
      setOfferings(fetchedOfferings);
      
      console.log('RevenueCat: Offerings fetched');
      console.log('RevenueCat: Current offering:', fetchedOfferings.current?.identifier);
      console.log('RevenueCat: Available packages:', fetchedOfferings.current?.availablePackages.map(p => p.identifier));
      
      if (!fetchedOfferings.current) {
        console.warn('RevenueCat: No current offering configured. Please set up offerings in RevenueCat dashboard.');
      }
    } catch (err: any) {
      console.error('RevenueCat: Error fetching offerings:', err);
    }
  };

  const refreshCustomerInfo = useCallback(async () => {
    if (Platform.OS === 'web') return;
    await fetchCustomerInfo();
  }, []);

  const identifyUser = useCallback(async (userId: string) => {
    if (Platform.OS === 'web') return;
    
    try {
      console.log('RevenueCat: Identifying user:', userId);
      const { customerInfo: newInfo } = await Purchases.logIn(userId);
      setCustomerInfo(newInfo);
      console.log('RevenueCat: User identified successfully');
    } catch (err: any) {
      console.error('RevenueCat: Error identifying user:', err);
    }
  }, []);

  const logoutUser = useCallback(async () => {
    if (Platform.OS === 'web') return;
    
    try {
      console.log('RevenueCat: Logging out user');
      const { customerInfo: newInfo } = await Purchases.logOut();
      setCustomerInfo(newInfo);
      console.log('RevenueCat: User logged out');
    } catch (err: any) {
      console.error('RevenueCat: Error logging out:', err);
    }
  }, []);

  const getMonthlyPackage = useCallback((): PurchasesPackage | null => {
    if (!offerings?.current) return null;
    return offerings.current.availablePackages.find(
      pkg => pkg.packageType === 'MONTHLY' || pkg.identifier === '$rc_monthly' || pkg.identifier === 'monthly'
    ) || null;
  }, [offerings]);

  const getYearlyPackage = useCallback((): PurchasesPackage | null => {
    if (!offerings?.current) return null;
    return offerings.current.availablePackages.find(
      pkg => pkg.packageType === 'ANNUAL' || pkg.identifier === '$rc_annual' || pkg.identifier === 'yearly'
    ) || null;
  }, [offerings]);

  const purchasePackage = useCallback(async (packageToPurchase: PurchasesPackage): Promise<boolean> => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Mobile App Required',
        'In-app purchases are only available on iOS and Android. Please download the mobile app to subscribe to Chef Plan.',
        [{ text: 'OK' }]
      );
      return false;
    }

    setPurchasing(true);
    setError(null);

    try {
      console.log('RevenueCat: Attempting purchase for package:', packageToPurchase.identifier);
      
      const { customerInfo: newInfo } = await Purchases.purchasePackage(packageToPurchase);
      setCustomerInfo(newInfo);

      // Check if purchase granted the entitlement
      if (newInfo.entitlements.active[CHEF_PLAN_ENTITLEMENT]?.isActive) {
        console.log('RevenueCat: Purchase successful! Chef Plan is now active.');
        return true;
      }

      console.log('RevenueCat: Purchase completed but entitlement not active');
      return false;
      
    } catch (err: any) {
      // Handle user cancellation
      if (err.userCancelled) {
        console.log('RevenueCat: User cancelled purchase');
        return false;
      }

      console.error('RevenueCat: Purchase error:', err);
      setError(err.message || 'Purchase failed');
      
      // Show appropriate error message
      let errorMessage = 'Unable to complete purchase. Please try again.';
      if (err.code === 'PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR') {
        errorMessage = 'This product is not available for purchase. Please check your RevenueCat dashboard configuration.';
      } else if (err.code === 'PURCHASE_NOT_ALLOWED_ERROR') {
        errorMessage = 'Purchases are not allowed on this device.';
      } else if (err.code === 'NETWORK_ERROR') {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      
      Alert.alert('Purchase Error', errorMessage);
      return false;
      
    } finally {
      setPurchasing(false);
    }
  }, []);

  // Present RevenueCat Paywall
  const presentPaywall = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Mobile App Required',
        'The subscription paywall is only available on iOS and Android. Please download the mobile app to subscribe.',
        [{ text: 'OK' }]
      );
      return false;
    }

    setPurchasing(true);
    setError(null);

    try {
      console.log('RevenueCat: Presenting paywall');
      
      const paywallResult = await RevenueCatUI.presentPaywall();
      
      console.log('RevenueCat: Paywall result:', paywallResult);

      switch (paywallResult) {
        case PAYWALL_RESULT.PURCHASED:
        case PAYWALL_RESULT.RESTORED:
          // Refresh customer info after purchase/restore
          await fetchCustomerInfo();
          console.log('RevenueCat: Purchase/Restore successful from paywall');
          return true;
          
        case PAYWALL_RESULT.NOT_PRESENTED:
          console.log('RevenueCat: Paywall was not presented - user may already have access');
          // Check if user already has entitlement
          await fetchCustomerInfo();
          return isChefPlan;
          
        case PAYWALL_RESULT.ERROR:
          console.error('RevenueCat: Paywall error');
          Alert.alert('Error', 'There was an error displaying the subscription options. Please try again.');
          return false;
          
        case PAYWALL_RESULT.CANCELLED:
        default:
          console.log('RevenueCat: Paywall dismissed by user');
          return false;
      }
      
    } catch (err: any) {
      console.error('RevenueCat: Error presenting paywall:', err);
      setError(err.message || 'Failed to present paywall');
      
      // Fallback: try manual purchase if paywall fails
      if (offerings?.current?.availablePackages?.length) {
        Alert.alert(
          'Subscription',
          'Would you like to subscribe to Chef Plan?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Subscribe',
              onPress: async () => {
                const pkg = getMonthlyPackage() || offerings.current!.availablePackages[0];
                await purchasePackage(pkg);
              }
            }
          ]
        );
      } else {
        Alert.alert('Error', 'Unable to load subscription options. Please try again later.');
      }
      return false;
      
    } finally {
      setPurchasing(false);
    }
  }, [offerings, isChefPlan, getMonthlyPackage, purchasePackage]);

  // Present paywall only if user doesn't have entitlement
  const presentPaywallIfNeeded = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Mobile App Required',
        'Subscriptions are available on the iOS and Android apps.',
        [{ text: 'OK' }]
      );
      return false;
    }

    // First check if user already has entitlement
    await fetchCustomerInfo();
    
    if (isChefPlan) {
      console.log('RevenueCat: User already has Chef Plan');
      return true;
    }

    try {
      console.log('RevenueCat: Presenting paywall if needed');
      
      const paywallResult = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: CHEF_PLAN_ENTITLEMENT,
      });

      if (paywallResult === PAYWALL_RESULT.PURCHASED || paywallResult === PAYWALL_RESULT.RESTORED) {
        await fetchCustomerInfo();
        return true;
      }
      
      if (paywallResult === PAYWALL_RESULT.NOT_PRESENTED) {
        // User already has access
        return true;
      }

      return false;
      
    } catch (err: any) {
      console.error('RevenueCat: Error presenting paywall if needed:', err);
      // Fallback to regular paywall
      return presentPaywall();
    }
  }, [isChefPlan, presentPaywall]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Mobile App Required',
        'Please use the iOS or Android app to restore purchases.',
        [{ text: 'OK' }]
      );
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('RevenueCat: Restoring purchases');
      const restoredInfo = await Purchases.restorePurchases();
      setCustomerInfo(restoredInfo);

      if (restoredInfo.entitlements.active[CHEF_PLAN_ENTITLEMENT]?.isActive) {
        Alert.alert('Success!', 'Your Chef Plan subscription has been restored.');
        return true;
      } else {
        Alert.alert('No Purchases Found', 'No active subscriptions were found for this account.');
        return false;
      }
      
    } catch (err: any) {
      console.error('RevenueCat: Restore error:', err);
      setError(err.message || 'Failed to restore purchases');
      Alert.alert('Error', 'Unable to restore purchases. Please try again or contact support.');
      return false;
      
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <RevenueCatContext.Provider
      value={{
        isInitialized,
        customerInfo,
        offerings,
        isChefPlan,
        loading,
        purchasing,
        error,
        purchasePackage,
        presentPaywall,
        presentPaywallIfNeeded,
        restorePurchases,
        refreshCustomerInfo,
        identifyUser,
        logoutUser,
        getMonthlyPackage,
        getYearlyPackage,
      }}
    >
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat() {
  const context = useContext(RevenueCatContext);
  if (context === undefined) {
    throw new Error('useRevenueCat must be used within a RevenueCatProvider');
  }
  return context;
}

// Helper hook for subscription status
export function useSubscriptionStatus() {
  const { isChefPlan, loading, customerInfo, refreshCustomerInfo } = useRevenueCat();
  
  const expirationDate = customerInfo?.entitlements?.active?.[CHEF_PLAN_ENTITLEMENT]?.expirationDate;
  const willRenew = customerInfo?.entitlements?.active?.[CHEF_PLAN_ENTITLEMENT]?.willRenew;
  
  return {
    isChefPlan,
    loading,
    expirationDate: expirationDate ? new Date(expirationDate) : null,
    willRenew,
    refresh: refreshCustomerInfo,
  };
}

// Helper hook for purchase actions
export function usePurchaseActions() {
  const { 
    presentPaywall, 
    presentPaywallIfNeeded, 
    restorePurchases, 
    purchasing,
    offerings,
    getMonthlyPackage,
    getYearlyPackage,
  } = useRevenueCat();

  return {
    presentPaywall,
    presentPaywallIfNeeded,
    restorePurchases,
    purchasing,
    hasOfferings: !!offerings?.current,
    monthlyPackage: getMonthlyPackage(),
    yearlyPackage: getYearlyPackage(),
  };
}
