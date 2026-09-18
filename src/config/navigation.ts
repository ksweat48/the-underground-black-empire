import type { ComponentType } from 'react';
import {
  User,
  Shield,
  Store,
  Vote,
  CreditCard,
} from 'lucide-react';
import { EmpireEmblemIcon } from '@/shared/components/empire-emblem-icon';

export interface NavItem {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
  requiresAuth: boolean;
  featureFlag?: string;
  adminOnly?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'The Empire',
    items: [
      {
        label: 'The Empire',
        path: '/empire',
        icon: EmpireEmblemIcon,
        description: 'Your dashboard',
        requiresAuth: true,
      },
      {
        label: 'Market',
        path: '/market',
        icon: Store,
        description: 'Local businesses, products, services, and events',
        requiresAuth: true,
      },
      {
        label: 'Vote',
        path: '/vote',
        icon: Vote,
        description: 'Community decisions and local priorities',
        requiresAuth: true,
      },
      {
        label: 'Membership',
        path: '/membership',
        icon: CreditCard,
        description: 'Choose your membership tier and benefits',
        requiresAuth: true,
      },
      {
        label: 'My Profile',
        path: '/profile',
        icon: User,
        description: 'Your profile and progress',
        requiresAuth: true,
      },
    ],
  },
];

export const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    label: 'Admin Console',
    path: '/admin',
    icon: Shield,
    description: 'Administrative controls and reporting',
    requiresAuth: true,
    adminOnly: true,
  },
];

