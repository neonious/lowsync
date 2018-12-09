###################
Configuration
###################

The configuration is stored in the file *lowsync.config.json*. The program searches for the file by traversing through all parent directories, starting from the current working directory.

To create a new configuration file, use the :doc:`/commands/commands/init` command.

.. list-table::
   :widths: 15 10 30 30 30
   :header-rows: 1

   * - Name
     - Datatype
     - Required
     - Default value
     - Description
   * - ip
     - string
     - yes
     - N/A
     - The IP address of the device. Will prompt the user if incorrect or missing.
   * - port
     - number
     - no
     - 8443 if useHttp config option is not set, else 8000
     - The port of the device.
   * - useHttp
     - boolean
     - no
     - false
     - Use http instead of https.
   * - syncDir
     - string
     - yes (for :doc:`/commands/commands/sync` command)
     - N/A
     - The directory on this computer that is used for file synchronization. Relative paths must be relative to the configuration file.
   * - exclude
     - array of string
     - no
     - Empty Array (no excludes)
     - Glob-like patterns that determine which files and folders are excluded from synchronization (see :doc:`/commands/commands/sync`). More about glob patterns can be found at `this link <https://github.com/isaacs/node-glob#readme>`_.
   * - transpile
     - boolean
     - no
     - true
     - Turn transpilation on or off for file synchronization. Can be overridden by :code:`--no-transpile` switch for the :doc:`/commands/commands/sync` command.

