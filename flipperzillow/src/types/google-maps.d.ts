declare global {
  interface Window {
    google?: {
      maps: {
        importLibrary: (lib: string) => Promise<any>;
        places?: {
          Autocomplete?: any;
        };
        event?: {
          clearInstanceListeners: (obj: any) => void;
        };
        Geocoder?: any;
        StreetViewService?: any;
        StreetViewPreference?: {
          NEAREST: string;
        };
        StreetViewSource?: {
          OUTDOOR: string;
        };
        LatLng?: any;
        geometry?: {
          spherical?: {
            computeHeading: (from: any, to: any) => number;
          };
        };
      };
    };
  }
}

export {};
