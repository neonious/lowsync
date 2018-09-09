###################
Configuration
###################

The configuration is stored in the file *lowrmt.config.json*. The program searches for the file by traversing through all parent directories, starting from the current working directory.

To create a new configuration file, use the :doc:`/commands/commands/init` command.

.. list-table::
   :widths: 15 10 30 30
   :header-rows: 1

   * - Name
     - Datatype
     - Required
     - Description
   * - ip
     - string
     - yes
     - The IP address of the device. Will prompt the user if incorrect or missing.
   * - syncDir
     - string
     - yes (for :doc:`/commands/commands/sync` command)
     - The directory on this computer that is used for file synchronization. Relative paths must be relative to the configuration file.
   * - exclude
     - array of string
     - no
     - Glob-like patterns that determine which files and folders are excluded from synchronization (see :doc:`/commands/commands/sync`). More about glob patterns can be found at `this link <https://github.com/isaacs/node-glob#readme>`_.
   * - transpile
     - boolean
     - no
     - Turn transpilation on or off for file synchronization. Can be overridden by :code:`--no-transpile` switch for the :doc:`/commands/commands/sync` command.

