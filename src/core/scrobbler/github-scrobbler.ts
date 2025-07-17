'use strict';

import type { BaseSong } from '@/core/object/song';
import BaseScrobbler from '@/core/scrobbler/base-scrobbler';
import type { SessionData } from './base-scrobbler';
import { timeoutPromise } from '@/util/util';
import { ServiceCallResult } from '../object/service-call-result';
import type ClonedSong from '../object/cloned-song';

type GitHubRequest = {
    eventName: string;
    time: number;
    data: {
        song: BaseSong;
        songs?: BaseSong[];
        isLoved?: boolean;
        currentlyPlaying?: boolean;
    };
};

/**
 * Module for all communication with the GitHub
 */

const baseUrl = "https://api.github.com/"
const apiUrl = `${baseUrl}repos/{owner}/{repo}/contents/{path}`;
export default class GitHubScrobbler extends BaseScrobbler<'GitHub'> {
    public userApiUrl!: string;
    public isLocalOnly = true;

    /** @override */
    protected getBaseProfileUrl(): string {
        return '';
    }

    /** @override */
    getLabel(): 'GitHub' {
        return 'GitHub';
    }

    /** @override */
    getStatusUrl(): string {
        return '';
    }

    /** @override */
    getStorageName(): 'GitHub' {
        return 'GitHub';
    }

    /** @override */
    getSession(): Promise<SessionData> {
        if (!this.arrayProperties || this.arrayProperties.length === 0) {
            return Promise.reject(new Error(''));
        }
        // Webhook connection doesn't have a session.
        return Promise.resolve({ sessionID: 'webhook' });
    }

    /** @override */
    public getAuthUrl(): Promise<string> {
        return Promise.resolve('');
    }

    /** @override */
    public isReadyForGrantAccess(): Promise<boolean> {
        return Promise.resolve(false);
    }

    /** @override */
    public async getProfileUrl(): Promise<string> {
        return Promise.resolve('');
    }

    /** @override */
    public getUserDefinedArrayProperties(): string[] {
        return ['applicationName', 'userApiUrl'];
    }

    public async getSongInfo(): Promise<Record<string, never>> {
        return Promise.resolve({});
    }

    /** @override */
    async sendRequest(request: GitHubRequest): Promise<ServiceCallResult> {
        if (!this.arrayProperties || this.arrayProperties.length === 0) {
            return ServiceCallResult.ERROR_AUTH;
        }
        this.debugLog(
            `GitHub - sendRequest: ${JSON.stringify(request, null, 2)}`,
        );
        const requestInfo = {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: request.eventName + ' at ' + request.time,
                committer: {
                    name: "WebScrobbler",
                    email: "webscrobbler@github.com"
                },
                content: btoa(JSON.stringify(request))
            }),
        };

        const promises: Promise<Response>[] = [];
        for (const props of this.arrayProperties) {
            const currentDate = new Date(request.time);
            const targetUrl = apiUrl
                .replace("{owner}", props.applicationName.split("/")[0])
                .replace("{repo}", props.applicationName.split("/")[1])
                .replace("{path}", currentDate.getUTCFullYear() + "/" + currentDate.getUTCMonth() + "/" + currentDate.getUTCDay() + "/" + currentDate.getTime() + "-" + request.eventName + ".json"); //Store files in folders as /YEAR/MONTH/DATE/EVENT-TIME.json
            
            promises.push(fetch(targetUrl, {
                ...requestInfo,
                headers: {
                    ...requestInfo.headers,
                    'Authorization': 'Bearer ' + props.userApiUrl
                }
            }));
        }
        const timeout = this.REQUEST_TIMEOUT;

        try {
            const responses = await timeoutPromise(
                timeout,
                Promise.all(promises),
            );
            for (const response of responses) {
                if (response.status !== 200) {
                    this.debugLog(`Error in ${response.url}.`, 'error');
                    return ServiceCallResult.ERROR_OTHER;
                }
            }
        } catch (e) {
            this.debugLog('Error while sending request', 'error');
            return ServiceCallResult.ERROR_OTHER;
        }

        return ServiceCallResult.RESULT_OK;
    }

    /** @override */
    async sendNowPlaying(song: BaseSong): Promise<ServiceCallResult> {
        return this.sendRequest({
            eventName: 'nowplaying',
            time: Date.now(),
            data: { song },
        });
    }

    /** @override */
    async sendPaused(song: BaseSong): Promise<ServiceCallResult> {
        return this.sendRequest({
            eventName: 'paused',
            time: Date.now(),
            data: { song },
        });
    }

    /** @override */
    async sendResumedPlaying(song: BaseSong): Promise<ServiceCallResult> {
        return this.sendRequest({
            eventName: 'resumedplaying',
            time: Date.now(),
            data: { song },
        });
    }

    /** @override */
    public async scrobble(
        songs: BaseSong[],
        currentlyPlaying: boolean,
    ): Promise<ServiceCallResult[]> {
        const res = await this.sendRequest({
            eventName: 'scrobble',
            time: Date.now(),
            // send the first song as a separate argument to avoid breaking older implementations
            data: {
                song: songs[0],
                songs,
                currentlyPlaying,
            },
        });
        return new Array<ServiceCallResult>(songs.length).fill(res);
    }

    /** @override */
    public toggleLove(
        song: ClonedSong,
        isLoved: boolean,
    ): Promise<ServiceCallResult | Record<string, never>> {
        return this.sendRequest({
            eventName: 'loved',
            time: Date.now(),
            data: { song, isLoved },
        });
    }
}
