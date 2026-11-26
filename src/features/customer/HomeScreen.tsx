import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand';
import { BRAND_ASSETS } from '@/constants/brandAssets';
import { isApiConfigured } from '@/constants/config';
import { FRONTEND_ONLY } from '@/constants/frontendOnly';
import {
  CategoryGrid,
  CategorySkeleton,
  categoryColumns,
  EXPERT_CARD_WIDTH,
  EventCard,
  eventCardWidth,
  ExpertCard,
  ExpertClusterArt,
  HeaderAvatar,
  HeroCarousel,
  HomeNotice,
  HomeSearchBar,
  HomeSearchResults,
  HomeSection,
  Rail,
  RailSkeleton,
  SlideFocalArt,
  ToolGrid,
  ToolGridSkeleton,
  type HeroSlide,
} from '@/features/customer/home/HomeSections';
import { expertInitials, toolHref } from '@/features/customer/liveCatalog';
import { useAccountScope, useMyNotifications } from '@/features/customer/myspace/accountData';
import { profileImageUrl, useProfileQuery } from '@/features/customer/myspace/parts';
import { useCustomerState } from '@/features/customer/store';
import { BottomNav, IconButton } from '@/features/customer/ui';
import { selectTools, useToolsCatalogue } from '@/features/tools/toolsCatalogue';
import { fetchExperts, fetchProgrammeEvents, type ApiExpert, type ApiTool } from '@/services/api/catalog';
import { resolveImageUrl } from '@/services/media/imageUrl';
import { brand, customer } from '@/theme';

const LIVE = !FRONTEND_ONLY && isApiConfigured();
const MAX_FRAME = 760;
const POPULAR_TOOL_COUNT = 4;
const SEARCH_MIN = 2;
const SEARCH_LIMIT = 5;

/** The website's "Try Our Tools" spotlight order (App\Support\Tools\ToolsSpotlight). */
const SPOTLIGHT_ORDER = [
  'daily-mood-check-in',
  'digital-journal',
  'financial-goal-calculator',
  'bmi-bmr-calculator',
  'daily-mindfulness-calm',
  'career-interest-test',
  'monthly-money-planner',
  'parenting-stress-check',
  'water-intake-tracker',
  'skills-strengths-assessment',
];

function popularTools(tools: ApiTool[]): ApiTool[] {
  const runnable = tools.filter((tool) => toolHref(tool) !== null);
  const ranked = [
    ...SPOTLIGHT_ORDER.flatMap((slug) => runnable.filter((tool) => tool.slug === slug)),
    ...runnable.filter((tool) => !SPOTLIGHT_ORDER.includes(tool.slug)),
  ];
  return ranked.slice(0, POPULAR_TOOL_COUNT);
}

function normalise(value: string | null | undefined): string {
  return (value ?? '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function buildSlides(experts: ApiExpert[]): HeroSlide[] {
  return [
    {
      key: 'growth',
      dark: true,
      background: brand.plumDeep,
      eyebrow: 'Your Everyday Growth Partner',
      title: 'Feel Better. Grow Further.',
      accent: 'Make Better Choices.',
      body: 'Expert guidance, practical tools and a supportive community.',
      cta: 'Find an Expert',
      href: '/(tabs)/experts',
      art: () => (
        <SlideFocalArt source={BRAND_ASSETS.heroPoster} aspectRatio={683 / 1024} focalX={0.55} focalY={0.38} />
      ),
    },
    {
      key: 'tools',
      background: '#FDF1F6',
      title: 'Try',
      accent: 'Our Tools',
      body: 'Practical tools for mental, emotional and personal growth.',
      cta: 'View All Tools',
      href: '/(tabs)/tools',
      art: () => (
        <SlideFocalArt source={BRAND_ASSETS.expertsHero} aspectRatio={768 / 478} focalX={0.55} focalY={0.2} />
      ),
    },
    {
      key: 'experts',
      background: brand.lilacSoft,
      eyebrow: 'Talk to our experts',
      title: 'Trusted guidance.',
      accent: 'Brighter tomorrows.',
      body: 'Connect with experienced experts for personalised advice and support.',
      cta: 'View All Experts',
      href: '/(tabs)/experts',
      art: (size) => <ExpertClusterArt experts={experts} width={size.width} height={size.height} />,
    },
    {
      key: 'professional',
      background: brand.heroCream,
      eyebrow: 'For professionals',
      title: 'Join as',
      accent: 'Professional',
      body: 'Showcase your expertise, reach the right audience and grow your practice with YuktiOne.',
      cta: 'Join as a Professional',
      href: '/professional/join',
      art: () => (
        <SlideFocalArt
          source={BRAND_ASSETS.professionalLaptop}
          aspectRatio={960 / 640}
          focalX={0.42}
          focalY={0.1}
        />
      ),
    },
  ];
}

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const frame = Math.min(width, MAX_FRAME);
  const contentWidth = Math.max(frame - 32, 248);
  const session = useCustomerState().session;
  const account = useAccountScope();
  const profile = useProfileQuery(account.enabled);
  const notifications = useMyNotifications(3);
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const term = normalise(query);
  const searching = term.length >= SEARCH_MIN;
  const expertTerm = useDebounced(term, 350);

  useFocusEffect(
    useCallback(() => {
      if (!account.enabled) return;
      void queryClient.refetchQueries({
        queryKey: ['v1', 'my', account.userId, 'notifications'],
        stale: true,
        type: 'active',
      });
    }, [queryClient, account.enabled, account.userId]),
  );

  const tools = useToolsCatalogue({ select: selectTools, enabled: LIVE });

  const experts = useQuery({
    queryKey: ['v1', 'experts', 'featured'],
    queryFn: async () => {
      const result = await fetchExperts({ featured: true, limit: 8 });
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    enabled: LIVE,
  });

  const events = useQuery({
    queryKey: ['v1', 'programme-events', 'homepage'],
    queryFn: async () => {
      const result = await fetchProgrammeEvents({ homepage: true });
      if (!result.ok) throw new Error(result.message);
      return result.events;
    },
    enabled: LIVE,
  });

  const expertSearch = useQuery({
    queryKey: ['v1', 'experts', 'search', expertTerm],
    queryFn: async () => {
      const result = await fetchExperts({ q: expertTerm, limit: SEARCH_LIMIT });
      if (!result.ok) throw new Error(result.message);
      return result.experts;
    },
    enabled: LIVE && expertTerm.length >= SEARCH_MIN,
    staleTime: 60_000,
  });

  const categories = useMemo(
    () => (experts.data?.categories ?? []).filter((category) => category.slug && category.label),
    [experts.data],
  );
  const featured = useMemo(() => experts.data?.experts ?? [], [experts.data]);
  const popular = useMemo(() => popularTools(tools.data ?? []), [tools.data]);
  const slides = useMemo(() => buildSlides(featured), [featured]);
  const today = useMemo(() => startOfToday(), []);

  const categoryMatches = useMemo(
    () =>
      searching
        ? categories
            .filter((category) => normalise(category.label).includes(term) || category.slug.includes(term))
            .slice(0, SEARCH_LIMIT)
        : [],
    [categories, searching, term],
  );
  const toolMatches = useMemo(
    () =>
      searching
        ? (tools.data ?? [])
            .filter((tool) =>
              [tool.name, tool.card_description, tool.catalogue_description, tool.explore_category?.label]
                .map(normalise)
                .some((field) => field.includes(term)),
            )
            .slice(0, SEARCH_LIMIT)
        : [],
    [tools.data, searching, term],
  );
  const expertPending = searching && (expertTerm !== term || expertSearch.isFetching);

  const name = profile.data?.name ?? session?.name ?? '';
  const signedIn = account.enabled && Boolean(name.trim());
  const unread = notifications.data?.pages[0]?.unread_count ?? 0;
  const categoryCount = categoryColumns(contentWidth) * 2;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      tools.refetch(),
      experts.refetch(),
      events.refetch(),
      account.enabled ? notifications.refetch() : Promise.resolve(),
    ]);
    setRefreshing(false);
  }, [tools, experts, events, notifications, account.enabled]);

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <View style={[styles.headerInner, { width: frame }]}>
          <BrandLogo width={contentWidth < 320 ? 108 : 124} />
          <View style={styles.headerActions}>
          <IconButton
            icon="notifications-outline"
              label={account.enabled && unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
              onPress={() => router.push('/notifications')}
              badge={account.enabled && unread > 0}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={signedIn ? 'Open My Space' : 'Sign in or open My Space'}
              onPress={() => router.push('/(tabs)/my-space')}
              hitSlop={6}
              style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
            >
              <HeaderAvatar
                uri={signedIn ? resolveImageUrl(profileImageUrl(profile.data)) : null}
                initials={signedIn ? expertInitials(name) : null}
              />
            </Pressable>
      </View>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={
          LIVE ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={brand.plum}
              colors={[brand.plum]}
            />
          ) : undefined
        }
        contentContainerStyle={styles.scroll}
      >
        <View style={[styles.content, { width: frame }]}>
          <HomeSearchBar
            value={query}
            onChangeText={setQuery}
            onSubmit={() => Keyboard.dismiss()}
          />

          {searching ? (
            <HomeSearchResults
              term={query.trim()}
              categories={categoryMatches}
              tools={toolMatches}
              experts={expertTerm === term ? (expertSearch.data ?? []) : []}
              expertsLoading={LIVE && expertPending}
              expertsFailed={LIVE && !expertPending && expertSearch.isError}
              onRetryExperts={() => void expertSearch.refetch()}
            />
          ) : (
            <>
              <HeroCarousel width={contentWidth} slides={slides} />

              {LIVE ? (
                <>
                  {experts.isPending || categories.length > 0 || experts.isError ? (
                    <HomeSection title="Explore by Category" onSeeAll={() => router.push('/(tabs)/explore')}>
                      {experts.isPending ? (
                        <CategorySkeleton contentWidth={contentWidth} />
                      ) : experts.isError ? (
                        <HomeNotice
                          text="We couldn't load categories right now."
                          action="Try again"
                          onAction={() => void experts.refetch()}
                        />
                      ) : (
                        <CategoryGrid
                          categories={categories.slice(0, categoryCount)}
                          contentWidth={contentWidth}
                        />
                      )}
                    </HomeSection>
      ) : null}

                  <HomeSection title="Popular Tools" onSeeAll={() => router.push('/(tabs)/tools')}>
                    {tools.isPending ? (
                      <ToolGridSkeleton contentWidth={contentWidth} />
                    ) : tools.isError ? (
                      <HomeNotice
                        text="We couldn't load tools right now."
                        action="Try again"
                        onAction={() => void tools.refetch()}
                      />
                    ) : popular.length > 0 ? (
                      <ToolGrid tools={popular} contentWidth={contentWidth} />
                    ) : (
                      <HomeNotice text="Tools will appear here once they're published." />
                    )}
                  </HomeSection>

                  <HomeSection title="Meet Our Experts" onSeeAll={() => router.push('/(tabs)/experts')}>
                    {experts.isPending ? (
                      <RailSkeleton width={EXPERT_CARD_WIDTH} height={78} />
                    ) : experts.isError ? (
                      <HomeNotice
                        text="We couldn't load experts right now."
                        action="Try again"
                        onAction={() => void experts.refetch()}
                      />
                    ) : featured.length > 0 ? (
                      <Rail label="Featured experts">
                        {featured.map((expert) => (
                          <ExpertCard key={expert.id} expert={expert} />
                        ))}
                      </Rail>
                    ) : (
                      <HomeNotice text="Experts will appear here once their profiles are approved." />
                    )}
                  </HomeSection>

                  {events.isPending || events.isError || (events.data?.length ?? 0) > 0 ? (
                    <HomeSection title="Programme & Events" onSeeAll={() => router.push('/programmes')}>
                      {events.isPending ? (
                        <RailSkeleton width={eventCardWidth(contentWidth)} height={136} />
                      ) : events.isError ? (
                        <HomeNotice
                          text="We couldn't load programmes right now."
                          action="Try again"
                          onAction={() => void events.refetch()}
                        />
                      ) : (
                        <Rail label="Programmes and events">
                          {(events.data ?? []).map((event) => (
                            <EventCard
                              key={event.id}
                              event={event}
                              width={eventCardWidth(contentWidth)}
                              today={today}
                            />
                          ))}
                        </Rail>
                      )}
                    </HomeSection>
      ) : null}
                </>
              ) : (
                <HomeNotice text="Connect the app to the YuktiOne server to load tools, experts and programmes." />
              )}
            </>
          )}
        </View>
      </ScrollView>

      <BottomNav preset="discover" active="home" />
      </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: customer.canvas },
  header: { backgroundColor: customer.canvas, paddingBottom: 8, alignItems: 'center' },
  headerInner: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  profileButton: { borderRadius: 20 },
  pressed: { opacity: 0.75 },
  scroll: { alignItems: 'center', paddingBottom: 28 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 22 },
});
