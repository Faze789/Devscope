import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks';

import { RepositoryOverviewScreen } from '../screens/Repository/RepositoryOverviewScreen';
import { DependencyListScreen } from '../screens/DependencyDetail/DependencyListScreen';
import { DependencyDetailScreen } from '../screens/DependencyDetail/DependencyDetailScreen';
import { CVEDetailScreen } from '../screens/CVEDetail/CVEDetailScreen';
import { SettingsScreen } from '../screens/Settings/SettingsScreen';

import type { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function TabIcon({ label, focused, color }: { label: string; focused: boolean; color: string }) {
  return (
    <View style={tabStyles.iconContainer}>
      <Text style={[tabStyles.icon, { color }]}>{label[0]}</Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  iconContainer: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  icon: {
    fontSize: 16,
    fontWeight: '700',
  },
});

function SecurityScreen() {
  const theme = useTheme();
  // Placeholder — shows all CVEs across repos
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 16 }}>
        Security overview coming soon
      </Text>
    </View>
  );
}

function HomeTabs() {
  const theme = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.borderSubtle,
          borderTopWidth: 1,
          elevation: 0,
          height: 56,
          paddingBottom: 6,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}>
      <Tab.Screen
        name="Overview"
        component={RepositoryOverviewScreen}
        options={{
          tabBarIcon: (props) => <TabIcon label="O" {...props} />,
        }}
      />
      <Tab.Screen
        name="Dependencies"
        component={DependencyListScreen}
        options={{
          tabBarIcon: (props) => <TabIcon label="D" {...props} />,
        }}
      />
      <Tab.Screen
        name="Security"
        component={SecurityScreen}
        options={{
          tabBarIcon: (props) => <TabIcon label="S" {...props} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: (props) => <TabIcon label="S" {...props} />,
        }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.text,
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 17,
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
      }}>
      <Stack.Screen
        name="Home"
        component={HomeTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DependencyList"
        component={DependencyListScreen}
        options={({ route }) => ({
          title: route.params.repositoryName,
        })}
      />
      <Stack.Screen
        name="DependencyDetail"
        component={DependencyDetailScreen}
        options={({ route }) => ({
          title: route.params.packageName,
        })}
      />
      <Stack.Screen
        name="CVEDetail"
        component={CVEDetailScreen}
        options={({ route }) => ({
          title: route.params.cveId,
        })}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Stack.Navigator>
  );
}
