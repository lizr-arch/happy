import * as React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useConnectAccount } from '@/hooks/useConnectAccount';
import { useConnectTerminal } from '@/hooks/useConnectTerminal';
import { Modal } from '@/modal';
import { t } from '@/text';

type ScannerTarget = 'terminal' | 'account';

const stylesheet = StyleSheet.create((theme) => ({
    root: {
        flex: 1,
        backgroundColor: '#000',
    },
    camera: {
        flex: 1,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 48,
    },
    topBar: {
        alignItems: 'flex-end',
    },
    cancelButton: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
    },
    cancelText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    frameContainer: {
        alignItems: 'center',
    },
    frame: {
        width: 260,
        height: 260,
        borderWidth: 2,
        borderColor: theme.colors.button.primary.background,
        borderRadius: 24,
        backgroundColor: 'rgba(0, 0, 0, 0.08)',
    },
    bottomPanel: {
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 18,
        borderRadius: 24,
        backgroundColor: 'rgba(0, 0, 0, 0.62)',
    },
    title: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
        textAlign: 'center',
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: theme.colors.surface,
    },
    message: {
        color: theme.colors.text,
        fontSize: 16,
        textAlign: 'center',
    },
    actionButton: {
        marginTop: 18,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 999,
        backgroundColor: theme.colors.button.primary.background,
    },
    actionText: {
        color: theme.colors.button.primary.tint,
        fontSize: 16,
        fontWeight: '700',
    },
}));

export default function QrScannerScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ target?: string }>();
    const [permission, requestPermission] = useCameraPermissions();
    const isProcessingRef = React.useRef(false);
    const target: ScannerTarget = params.target === 'account' ? 'account' : 'terminal';
    const terminal = useConnectTerminal({ onSuccess: () => router.back() });
    const account = useConnectAccount({ onSuccess: () => router.back() });
    const { theme } = useUnistyles();
    const styles = stylesheet;

    React.useEffect(() => {
        if (permission && !permission.granted && permission.canAskAgain) {
            requestPermission();
        }
    }, [permission, requestPermission]);

    const handleBarcodeScanned = React.useCallback(async (event: BarcodeScanningResult) => {
        if (isProcessingRef.current) {
            return;
        }

        const data = event.data;
        const expectedPrefix = target === 'account' ? 'happy:///account?' : 'happy://terminal?';

        if (!data.startsWith(expectedPrefix)) {
            isProcessingRef.current = true;
            Modal.alert(t('common.error'), t('modals.invalidAuthUrl'), [
                {
                    text: t('common.ok'),
                    onPress: () => {
                        isProcessingRef.current = false;
                    }
                }
            ]);
            return;
        }

        isProcessingRef.current = true;
        const handled = target === 'account'
            ? await account.processAuthUrl(data)
            : await terminal.processAuthUrl(data);

        if (!handled) {
            isProcessingRef.current = false;
        }
    }, [account, target, terminal]);

    if (!permission) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator color={theme.colors.button.primary.background} />
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <View style={styles.centered}>
                <Text style={styles.message}>{t('modals.cameraPermissionsRequiredToScanQr')}</Text>
                {permission.canAskAgain ? (
                    <Pressable style={styles.actionButton} onPress={requestPermission}>
                        <Text style={styles.actionText}>{t('components.emptyMainScreen.openCamera')}</Text>
                    </Pressable>
                ) : null}
                <Pressable style={styles.actionButton} onPress={() => router.back()}>
                    <Text style={styles.actionText}>{t('common.cancel')}</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <Stack.Screen options={{ headerShown: false }} />
            <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={isProcessingRef.current ? undefined : handleBarcodeScanned}
            />
            <View pointerEvents="box-none" style={styles.overlay}>
                <View style={styles.topBar}>
                    <Pressable style={styles.cancelButton} onPress={() => router.back()}>
                        <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                    </Pressable>
                </View>
                <View pointerEvents="none" style={styles.frameContainer}>
                    <View style={styles.frame} />
                </View>
                <View pointerEvents="none" style={styles.bottomPanel}>
                    <Text style={styles.title}>{t('components.emptyMainScreen.scanQrCode')}</Text>
                </View>
            </View>
        </View>
    );
}
